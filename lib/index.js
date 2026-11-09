import { createUpdates } from './update.js';
import { validateSchedule, intervalAt, nextBoundary } from './schedule.js';
import { parseHistoryRange } from './history-range.js';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { WeiboBrowser } from './platforms/weibo/index.js';
import { XueqiuBrowser } from './platforms/xueqiu/index.js';
import { dataDirectory, workspaceDirectory, saveWorkspaceDirectory, chooseDirectory } from './paths.js';
import { Documents } from './documents.js';
import { Avatars } from './avatars.js';
import { SocialAgent } from './agent.js';
import { CaptureError } from './capture-error.js';
import { platformImage } from './text.js';
import { backup } from 'node:sqlite';
import { join, resolve, isAbsolute } from 'node:path';
import { existsSync, mkdirSync, realpathSync, readFileSync, cpSync, writeFileSync, unlinkSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

export const name = 'dsh-social-trace';
export const inject = ['webServer'];
const PREFIX = '/dsh-social-trace';

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('请使用 JSON 请求');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 16384) throw new Error('请求过大');
  }
  return JSON.parse(body || '{}');
}

function localRequest(req) {
  const host = new URL('http://' + req.headers.host).hostname;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const address = req.socket.remoteAddress;
  return local && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

export function createRuntime(directory = dataDirectory(), { adapterFactories = { weibo: WeiboBrowser, xueqiu: XueqiuBrowser }, chooseFolder = chooseDirectory, avatarFetch = fetch, getIM = () => null, updates = createUpdates() } = {}) {
  let workspace = realpathSync(workspaceDirectory(directory));
  let store = new Store(workspace);
  let documents = new Documents(store, workspace);
  const avatars = new Avatars(join(directory, 'avatar-cache'), avatarFetch);
  let changingWorkspace = false;
  let applyingUpdate = false;
  let workspaceTask = null;
  let exporting = 0;
  let serviceError = '';
  const agent = new SocialAgent(() => store, getIM, () => changingWorkspace || applyingUpdate || closing);
  const sources = Object.fromEntries(Object.entries(adapterFactories).map(([id, Adapter]) => {
    let worker;
    const browser = new Adapter(directory, options => worker.beforeRequest(options), () => store.account(id).uid);
    if (browser.defaults && !store.getSetting('targetDefaults:' + id, null)) store.setSetting('targetDefaults:' + id, { intervalMs: browser.defaults.intervalMs, historyGapMs: browser.defaults.historyGapMs });
    worker = new Worker(store, browser, { documents, monitoringGapMs: id === 'weibo' ? 3000 : browser.defaults?.requestGapMs || 15000,
      requestGapMs: Math.max(browser.defaults?.requestGapMs || 15000, store.getSetting(id === 'weibo' ? 'requestGapMs' : `requestGapMs:${id}`, browser.defaults?.requestGapMs || 15000)) });
    return [id, { browser, worker, loginBusy: false, historyBusy: false }];
  }));
  const { browser, worker } = sources.weibo;
  let closing = false;

  function enableAuthorJob(uid, kind) {
    if (store.getSetting('targetEnabled:' + uid, true)) return;
    for (const job of store.jobs().filter(job => job.uid === uid && job.kind !== kind && job.status === 'queued')) store.updateJob(job.id, { status: 'paused', message: '保留原博主关闭状态，等待单独开启' });
    store.setSetting('targetEnabled:' + uid, true);
  }

  async function changeWorkspace(input) {
    if (typeof input !== 'string' || !isAbsolute(input.trim()) || input.includes('\0')) {
      throw new CaptureError('storage', '请选择信息保存位置，或填写文件夹的完整路径');
    }
    let destination;
    let probe;
    try {
      mkdirSync(resolve(input.trim()), { recursive: true, mode: 0o700 });
      destination = realpathSync(resolve(input.trim()));
      probe = join(destination, '.social-trace-write-' + randomUUID());
      writeFileSync(probe, '', { mode: 0o600 }); unlinkSync(probe); probe = null;
    } catch {
      if (probe) { try { unlinkSync(probe); } catch { /* No probe file to clean up. */ } }
      throw new CaptureError('storage', '无法写入所选信息保存位置，请检查路径、权限和磁盘空间');
    }
    if (destination === workspace) { saveWorkspaceDirectory(directory, destination); await documents.sync({ backgroundImages: true }); return; }
    const database = join(destination, 'archive.sqlite');
    if (existsSync(database)) throw new CaptureError('storage', '所选文件夹已有资料库，为避免覆盖，请选择一个新的文件夹');
    if (agent.busy) throw new CaptureError('storage', '请等当前消息投递结束后再切换信息保存位置');
    if (exporting) throw new CaptureError('storage', '正在导出文档，请等导出完成后再切换信息保存位置');
    if (Object.values(sources).some(source => source.loginBusy || source.historyBusy)) throw new CaptureError('storage', '请等登录窗口打开完成后再切换信息保存位置');
    changingWorkspace = true;
    Object.values(sources).forEach(source => { source.worker.suspended = true; });
    const temporary = join(destination, '.archive-' + randomUUID() + '.sqlite');
    let nextStore;
    let installed = false;
    let committed = false;
    try {
      await Promise.all(Object.values(sources).map(source => source.worker.busy));
      documents.stopping = true;
      if (documents.task) await documents.task;
      if (documents.queueTask) await documents.queueTask;
      await Promise.allSettled([...documents.imageTasks.values()]);
      if (closing) throw new Error('实例正在关闭');
      Object.values(sources).forEach(source => source.worker.claim());
      await backup(store.db, temporary);
      // Reserve the name without overwriting an existing archive created during backup.
      writeFileSync(database, '', { flag: 'wx', mode: 0o600 }); installed = true;
      renameSync(temporary, database);
      nextStore = new Store(destination);
      if (existsSync(join(workspace, 'documents'))) cpSync(join(workspace, 'documents'), join(destination, 'documents'), { recursive: true, force: false });
      const nextDocuments = new Documents(nextStore, destination);
      saveWorkspaceDirectory(directory, destination);
      const previous = store;
      store = nextStore; documents = nextDocuments; workspace = destination;
      Object.values(sources).forEach(source => { source.worker.store = store; source.worker.documents = documents; });
      committed = true;
      previous.close();
    } catch {
      if (committed) throw new CaptureError('storage', '新信息保存位置已启用，请重启插件完成旧资料库的关闭');
      if (nextStore) nextStore.close();
      rmSync(temporary, { force: true });
      if (installed) for (const suffix of ['', '-wal', '-shm']) rmSync(database + suffix, { force: true });
      throw new CaptureError('storage', '信息保存位置切换失败，原资料库继续保留，请检查目标文件夹权限和磁盘空间');
    } finally {
      changingWorkspace = false;
      documents.stopping = false;
      if (!committed && !closing) void documents.sync({ backgroundImages: true });
      Object.values(sources).forEach(source => { source.worker.suspended = false; });
    }
    await documents.sync({ backgroundImages: true });
  }

  async function handle(req, res) {
    try {
      if (!localRequest(req)) return json(res, 403, { error: 'Social Trace 仅接受本机连接' });
      const url = new URL(req.url, 'http://' + req.headers.host);
      const path = url.pathname.slice(PREFIX.length);
      if (req.method === 'GET') {
        if (path === '/update') return json(res, 200, { update: await updates.check(url.searchParams.get('fresh') === '1') });
        if (path === '/update/state') return json(res, 200, { update: updates.view() });
        if (path === '/assets/xueqiu.png') {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
          return res.end(readFileSync(new URL('../assets/xueqiu.png', import.meta.url)));
        }
        if (path === '/assets/weibo.ico') {
          res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
          return res.end(readFileSync(new URL('../assets/weibo.ico', import.meta.url)));
        }
        if (path === '/agent') return json(res, 200, agent.status());
        if (path === '/agent/bots') { await agent.refreshConnections(); return json(res, 200, { items: await agent.bots(), available: agent.status().transportAvailable }); }
        if (path === '/agent/targets') return json(res, 200, { items: await agent.targets(url.searchParams.get('botId') || '') });
        if (path === '/status') return json(res, 200, {
          update: updates.view(), agent: agent.status(), enabled: store.getSetting('monitorEnabled', true),
          account: store.account(), targets: store.targets().map(target => ({ ...target, historyOriginalOnly: store.getSetting('historyOriginalOnly:' + target.uid, false), policy: store.getSetting('targetPolicy:' + target.uid, null), enabled: store.getSetting('targetEnabled:' + target.uid, true) })), jobs: store.jobs().map(({ checkpoint, ...job }) => ({
            ...job, page: checkpoint.page || 1, pending: checkpoint.pending?.length || 0,
            reportedTotal: checkpoint.reportedTotal, oldestAt: checkpoint.oldestAt,
            platform: store.target(job.uid).platform,
          })), notices: store.notices(), unreadNotices: store.unreadNotices(), count: store.count(), todayNewCount: store.todayNewCount(),
          requestGapMs: worker.requestGapMs, loginBusy: sources.weibo.loginBusy, stopped: Object.values(sources).every(source => source.worker.stopping),
          serviceError,
          unreadContent: store.unreadContent(), archiveSummary: store.archiveSummary(), progress: store.targetProgress(), activeJobId: worker.currentJobId,
          storage: { workspaceDirectory: workspace, workspaceConfigured: existsSync(join(directory, 'workspace.json')), documentsDirectory: documents.directory,
            changing: changingWorkspace, syncing: documents.syncing, mediaSyncing: documents.imageTasks.size > 0, mediaQueued: documents.imageQueue.size, error: documents.error, mediaError: documents.mediaError },
          activeJobIds: Object.values(sources).map(source => source.worker.currentJobId).filter(Boolean),
          accounts: Object.fromEntries(Object.keys(sources).map(id => [id, store.account(id)])),
          platforms: Object.entries(sources).map(([id, source]) => {
            const schedule = store.getSetting('schedule:' + id, { enabled: false, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1, repeat: 'weekdays' }] });
            const targetDefaults = store.getSetting(id === 'weibo' ? 'targetDefaults' : `targetDefaults:${id}`, { intervalMs: 900000, historyGapMs: 60000 });
            const now = Date.now(), change = nextBoundary(schedule, now);
            return { id, name: source.browser.name, enabled: store.getSetting('platformEnabled:' + id, true), schedule, targetDefaults,
              frequency: { intervalMs: intervalAt(schedule, targetDefaults.intervalMs, now), nextChangeAt: Number.isFinite(change) ? change : null,
                nextIntervalMs: Number.isFinite(change) ? intervalAt(schedule, targetDefaults.intervalMs, change) : null },
              health: store.monitoringHealth(id, Math.min(source.worker.requestGapMs, source.worker.monitoringGapMs)),
              requestGapMs: source.worker.requestGapMs, profileRequestAt: store.getSetting('profileRequestAt:' + id, 0), loginBusy: source.loginBusy, stopped: source.worker.stopping, lastFailure: store.getSetting('lastFailure:' + id, null) };
          }),
          targetDefaults: store.getSetting('targetDefaults', { intervalMs: 900000, historyGapMs: 60000 }),
        });
        if (path === '/avatar') {
          const target = store.target(url.searchParams.get('uid') || '');
          const image = target && platformImage(target.avatar_url, target.platform);
          if (!image) return json(res, 404, { error: '该博主尚无头像' });
          try {
            const { type, bytes } = await avatars.get(image);
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': url.searchParams.get('v') === image ? 'private, max-age=31536000, immutable' : 'private, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff' });
            return res.end(bytes);
          } catch { return json(res, 502, { error: '头像暂时无法读取，请稍后刷新' }); }
        }
        if (path === '/media') {
          if (changingWorkspace) return json(res, 409, { error: '正在更换保存位置' });
          const post = store.postImages(url.searchParams.get('id') || '', url.searchParams.get('quote') === '1');
          const index = Number(url.searchParams.get('index'));
          if (!post || !Number.isInteger(index) || index < 0 || !post.images[index]) return json(res, 404, { error: '图片不存在' });
          exporting++;
          try {
            const { bytes, type } = await documents.image(post.uid, post.images[index]);
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
            return res.end(bytes);
          } finally { exporting--; }
        }
        if (path === '/posts') return json(res, 200, { items: store.posts({
          ids: url.searchParams.get('postId') ? [url.searchParams.get('postId')] : null,
          uid: url.searchParams.get('uid') || '', query: (url.searchParams.get('q') || '').slice(0, 200), kind: url.searchParams.get('kind') || 'all',
          offset: Math.min(1000000, Math.max(0, Number(url.searchParams.get('offset')) || 0)),
        }) });
        if (path === '/export') {
          if (changingWorkspace) return json(res, 409, { error: '正在切换信息保存位置，请稍后导出' });
          const uid = url.searchParams.get('uid') || '';
          if (uid && !store.target(uid)) return json(res, 404, { error: '关注对象不存在' });
          exporting++;
          try {
            const markdown = url.searchParams.get('format') === 'md';
            res.writeHead(200, {
              'Content-Type': markdown ? 'text/markdown; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
              'Content-Disposition': `attachment; filename="social-trace-${uid || 'all'}.${markdown ? 'md' : 'jsonl'}"`,
              'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            });
            if (markdown) res.write('# Social Trace 本地档案\n\n');
            const statement = store.db.prepare(`SELECT id,uid,author,published_at,text,url,quote,complete FROM posts
              ${uid ? 'WHERE uid=?' : ''} ORDER BY published_at DESC,id DESC`);
            for (const post of statement.iterate(...(uid ? [uid] : []))) {
              const quote = post.quote ? JSON.parse(post.quote) : null;
              const text = markdown
                ? `## ${post.author} · ${new Date(post.published_at).toISOString()}\n\n${post.url}\n\n${post.text}\n\n${quote ? '转发原文 · ' + quote.author + '\n\n' + quote.text + '\n\n' : ''}---\n\n`
                : JSON.stringify({ ...post, quote }) + '\n';
              if (!res.write(text)) await once(res, 'drain');
            }
            return res.end();
          } finally { exporting--; }
        }
        return json(res, 404, { error: '接口不存在' });
      }
      if (req.method !== 'POST') return json(res, 405, { error: '不支持此方法' });
      if (req.headers['x-social-trace'] !== '1') return json(res, 403, { error: '缺少本机操作标记' });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        return json(res, 403, { error: '拒绝跨站操作' });
      }
      const body = await readBody(req);
      if (workspaceTask) return json(res, 409, { error: '正在切换信息保存位置，请稍后操作' });
      if (updates.view().phase === 'applying') return json(res, 409, { error: '插件正在更新，请稍后操作' });
      if (path === '/update') {
        if (exporting || Object.values(sources).some(source => source.loginBusy || source.historyBusy)) return json(res, 409, { error: '请等当前登录、缓存设置或导出完成后再更新' });
        try {
          const update = updates.start(body.version, async apply => {
            applyingUpdate = true;
            Object.values(sources).forEach(source => { source.worker.suspended = true; });
            documents.stopping = true;
            try {
              await Promise.all([agent.busy, documents.task, documents.queueTask, ...documents.imageTasks.values(), ...Object.values(sources).map(source => source.worker.busy)]);
              return await apply();
            } finally {
              applyingUpdate = false;
              if (!closing) {
                documents.stopping = false;
                Object.values(sources).forEach(source => { source.worker.suspended = false; source.worker.wake(); });
                documents.drainImages();
              }
            }
          });
          return json(res, 202, { update });
        } catch (error) { return json(res, 409, { error: error.message }); }
      }
      if (path === '/service/retry') {
        await Promise.all(Object.values(sources).map(source => source.worker.stop()));
        start();
        return json(res, serviceError ? 409 : 200, serviceError ? { error: serviceError } : { ok: true });
      }
      if (serviceError) return json(res, 503, { error: serviceError });
      if (path === '/agent/settings' || path === '/agent/test') {
        try { return json(res, 200, path === '/agent/test' ? await agent.test(body) : { config: await agent.configure(body) }); }
        catch (error) { return json(res, 400, { error: error.message }); }
      }
      if (path === '/workspace/pick') {
        try { return json(res, 200, { directory: await chooseFolder() }); }
        catch (error) { throw new CaptureError('storage', error.message); }
      }
      if (path === '/workspace') {
        workspaceTask = changeWorkspace(body.directory);
        try { await workspaceTask; } finally { workspaceTask = null; }
        return json(res, 200, { ok: true });
      }
      if (path === '/workspace/sync') { await documents.sync({ backgroundImages: body.images !== true }); return json(res, 200, { ok: !documents.error && !documents.mediaError }); }
      if (path === '/monitoring') {
        if (typeof body.enabled !== 'boolean') return json(res, 400, { error: '开关值必须为布尔值' });
        let key;
        if (body.scope === 'all') key = 'monitorEnabled';
        else if (body.scope === 'platform' && sources[body.platform]) key = 'platformEnabled:' + body.platform;
        else if (body.scope === 'target' && store.target(body.uid)) key = 'targetEnabled:' + body.uid;
        else return json(res, 400, { error: '请选择有效的控制器、平台或博主' });
        store.setSetting(key, body.enabled);
        Object.values(sources).forEach(source => source.worker.wake());
        if (body.enabled) documents.drainImages();
        return json(res, 200, { ok: true });
      }
      const platform = body.platform || 'weibo';
      const source = sources[platform];
      if (!source) return json(res, 400, { error: '此平台尚未接入' });
      const { browser: platformBrowser, worker: platformWorker } = source;
      const platformName = platformBrowser.name;
      if (source.historyBusy) return json(res, 409, { error: '正在调整缓存范围，请稍候' });
      if (path === '/targets/policy') {
        const target = store.target(body.uid);
        if (!target || target.platform !== platform || typeof body.inherit !== 'boolean') return json(res, 400, { error: '请选择有效的博主设置' });
        const interval = Number(body.intervalMinutes);
        if (!body.inherit && (!Number.isInteger(interval) || interval < 1 || interval > 10080)) return json(res, 400, { error: '检查间隔为 1–10080 分钟' });
        const policy = body.inherit ? null : { intervalMs: interval * 60000, schedule: validateSchedule(body.schedule) };
        store.setSetting('targetPolicy:' + target.uid, policy);
        platformWorker.rescheduleUpdates();
      } else if (path === '/history/pause') {
        const targets = body.uid ? [store.target(body.uid)] : body.scope === 'platform' ? store.targets().filter(target => target.platform === platform) : [];
        if (!targets.length || targets.some(target => !target || target.platform !== platform)) return json(res, 400, { error: '请选择要暂停缓存的博主' });
        const uids = new Set(targets.map(target => target.uid));
        for (const job of store.jobs().filter(job => uids.has(job.uid) && job.kind === 'history' && job.status !== 'complete')) store.updateJob(job.id, { status: 'paused', message: '以前消息的缓存已暂停，进度保留' });
      } else if (path === '/targets/start') {
        const target = store.target(body.uid);
        if (!target || target.platform !== platform || target.capture_mode !== 'pending') return json(res, 400, { error: '请选择待配置的博主' });
        if (!['from_now', 'history'].includes(body.mode)) return json(res, 400, { error: '请选择记录方式' });
        if (body.kind !== undefined && (!['updates', 'history'].includes(body.kind) || (body.kind === 'history') !== (body.mode === 'history'))) return json(res, 400, { error: '请选择有效的任务类型' });
        if (body.originalOnly !== undefined && typeof body.originalOnly !== 'boolean') return json(res, 400, { error: '请选择有效的缓存内容类型' });
        if (store.account(platform).status !== 'ready') return json(res, 409, { error: '请先登录并确认' + platformName + '连接' });
        if (!target.profile_checked_at) return json(res, 409, { error: '请先读取博主资料' });
        const range = body.mode === 'history' ? parseHistoryRange(body.from, body.to) : { from: null, to: null };
        store.transaction(() => {
          const now = Math.floor(Date.now() / 1000) * 1000;
          store.db.prepare('UPDATE targets SET capture_mode=?,record_from=?,history_from=?,history_to=? WHERE uid=?').run(body.mode, now, range.from, range.to, target.uid);
          store.setSetting('targetEnabled:' + target.uid, true);
          store.setSetting('historyOriginalOnly:' + target.uid, body.originalOnly === true);
          if (body.mode === 'history') store.setSetting('historyRequested:' + target.uid, true);
          for (const job of store.jobs().filter(job => job.uid === target.uid)) store.updateJob(job.id, { checkpoint: {}, pages: 0, saved: 0, status: (body.kind ? job.kind === body.kind : job.kind === 'updates' || body.mode === 'history') ? 'queued' : 'paused', next_run_at: 0, message: job.kind === 'history' && body.mode !== 'history' ? '未开启历史缓存' : '记录方式已确认，等待执行' });
          store.notice('task', target.name + (body.kind === 'history' ? '：已开启历史缓存' : body.mode === 'history' ? '：已开启历史缓存与新动态监控' : '：从现在开始记录新动态'), Date.now(), target.uid);
        })();
      } else if (path === '/history/range') {
        if (body.enableTarget !== undefined && typeof body.enableTarget !== 'boolean') return json(res, 400, { error: '无效的博主开关值' });
        const targets = body.uid ? [store.target(body.uid)] : body.scope === 'platform' ? store.targets().filter(target => target.platform === platform && target.capture_mode !== 'pending') : [];
        if (!targets.length || targets.some(target => !target || target.platform !== platform)) return json(res, 400, { error: '请先添加并设置要缓存的博主' });
        if (targets.some(target => target.capture_mode === 'pending')) return json(res, 409, { error: '请先确认从何时开始记录' });
        if (source.loginBusy) return json(res, 409, { error: '请完成当前账号操作后重试' });
        const range = parseHistoryRange(body.from, body.to);
        if (body.originalOnly !== undefined && typeof body.originalOnly !== 'boolean') return json(res, 400, { error: '请选择有效的缓存内容类型' });
        source.historyBusy = true; platformWorker.suspended = true;
        try {
          if (platformWorker.busy) await platformWorker.busy;
          store.transaction(() => {
            for (const target of targets) {
              if (body.enableTarget === true && body.uid) enableAuthorJob(target.uid, 'history');
              const job = store.jobs().find(job => job.uid === target.uid && job.kind === 'history');
              const originalOnly = body.originalOnly ?? store.getSetting('historyOriginalOnly:' + target.uid, false);
              const changed = target.history_from !== range.from || target.history_to !== range.to || originalOnly !== store.getSetting('historyOriginalOnly:' + target.uid, false);
              store.db.prepare('UPDATE targets SET history_from=?,history_to=? WHERE uid=?').run(range.from, range.to, target.uid);
              store.setSetting('historyOriginalOnly:' + target.uid, originalOnly);
              store.setSetting('historyRequested:' + target.uid, true);
              if (changed) store.updateJob(job.id, { checkpoint: {}, pages: 0, saved: 0, last_success_at: null, status: 'queued', next_run_at: 0, message: '按选定日期缓存以前的消息，已有内容保留' });
              else if (job.status !== 'complete') store.updateJob(job.id, { status: 'queued', message: '等待继续缓存以前的消息' });
            }
          })();
        } finally { source.historyBusy = false; platformWorker.suspended = false; platformWorker.wake(); }
      } else if (path === '/targets/profile') {
        const target = store.target(body.uid);
        if (!target || target.platform !== platform || !platformBrowser.profile) return json(res, 400, { error: '请选择有效的' + platformName + '博主' });
        if (body.interactive !== undefined && typeof body.interactive !== 'boolean') return json(res, 400, { error: '无效的资料读取方式' });
        if (source.loginBusy) return json(res, 409, { error: '正在处理账号，请稍后刷新博主资料' });
        source.loginBusy = true;
        platformWorker.suspended = true;
        try {
          if (!body.interactive && platformWorker.busy) await platformWorker.busy;
          const profile = await platformBrowser.profile(target.external_uid, { profileOnly: true, interactiveProfile: body.interactive === true });
          platformWorker.requestSucceeded();
          store.db.prepare('UPDATE targets SET name=?,avatar_url=COALESCE(?,avatar_url),profile_total=COALESCE(?,profile_total),profile_checked_at=? WHERE uid=?').run(profile.name, profile.avatar, profile.total ?? null, Date.now(), target.uid);
        } catch (error) {
          platformWorker.failAccount(error);
          throw error;
        } finally { source.loginBusy = false; platformWorker.suspended = false; platformWorker.wake(); }
      } else if (path === '/login') {
        if (source.loginBusy || platformWorker.busy) return json(res, 409, { error: '正在执行任务，请稍后打开登录窗口' });
        source.loginBusy = true;
        store.setAccount({ status: 'needs_login', reason: `请在${platformName}完成登录或验证，然后点击确认连接` }, platform);
        try { await platformBrowser.login(); } finally { source.loginBusy = false; }
      } else if (path === '/verify') {
        if (platformWorker.busy || source.loginBusy) return json(res, 409, { error: '正在执行任务，请稍后确认登录' });
        source.loginBusy = true; platformWorker.suspended = true;
        try {
          const uid = await platformBrowser.checkLogin();
          const previous = store.account(platform);
          if (previous.uid && previous.uid !== uid) {
            return json(res, 409, { error: '当前登录账号与此档案库绑定账号不同，请切回原账号或使用独立数据目录' });
          }
          store.setAccount({ uid, status: 'ready', reason: '', errors: 0 }, platform);
          store.notice('task', `已确认${platformName}登录`);
        } catch (error) {
          platformWorker.failAccount(error);
          throw error;
        } finally { source.loginBusy = false; platformWorker.suspended = false; platformWorker.wake(); }
      } else if (path === '/account/pause') {
        store.setAccount({ status: 'paused', reason: `已手动暂停${platformName}采集` }, platform);
      } else if (path === '/targets') {
        let uid;
        try { uid = platformBrowser.parseAuthor(body.url); } catch (error) { throw new CaptureError('input', error.message); }
        if (store.target(store.authorKey(uid, platform))) return json(res, 409, { error: '此博主已在关注列表中' });
        if (body.archiveHistory !== undefined && typeof body.archiveHistory !== 'boolean') return json(res, 400, { error: '请选择是否缓存历史内容' });
        const range = parseHistoryRange(body.historyFrom, body.historyTo);
        store.addTarget(uid, uid, Date.now(), platform, { archiveHistory: body.archiveHistory === true, historyFrom: range.from, historyTo: range.to, captureMode: 'pending' });
      } else if (path === '/notices/read') {
        if (body.uid && !store.target(body.uid)) return json(res, 400, { error: '博主不存在' });
        if (body.kind && !['update', 'attention', 'task'].includes(body.kind)) return json(res, 400, { error: '消息类型无效' });
        store.acknowledge({ id: body.id, uid: body.uid, kind: body.kind });
      } else if (path === '/settings/history') {
        const seconds = Number(body.historyGapSeconds);
        if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400) return json(res, 400, { error: '历史每页等待时间为 60–86400 秒' });
        const key = platform === 'weibo' ? 'targetDefaults' : `targetDefaults:${platform}`;
        store.transaction(() => {
          store.setSetting(key, { ...store.getSetting(key, { intervalMs: 900000 }), historyGapMs: seconds * 1000 });
          store.db.prepare('UPDATE targets SET history_gap_ms=? WHERE platform=?').run(seconds * 1000, platform);
        })();
      } else if (path === '/settings') {
        const gap = body.requestGapSeconds === undefined ? platformWorker.requestGapMs / 1000 : Number(body.requestGapSeconds);
        const history = body.historyGapSeconds === undefined ? store.getSetting(platform === 'weibo' ? 'targetDefaults' : `targetDefaults:${platform}`, { historyGapMs: 60000 }).historyGapMs / 1000 : Number(body.historyGapSeconds);
        const interval = Number(body.intervalMinutes);
        const schedule = body.schedule === undefined ? store.getSetting('schedule:' + platform, null) : validateSchedule(body.schedule);
        const minimumGap = (platformBrowser.defaults?.requestGapMs || 15000) / 1000;
        if (![gap, history, interval].every(Number.isInteger) || gap < minimumGap || gap > 3600
            || history < 60 || history > 86400 || interval < 1 || interval > 10080) {
          return json(res, 400, { error: '请求间隔 ' + minimumGap + '–3600 秒；历史批次间隔 60–86400 秒；更新检查 1–10080 分钟' });
        }
        store.transaction(() => {
          if (schedule) store.setSetting('schedule:' + platform, schedule);
          store.setSetting(platform === 'weibo' ? 'requestGapMs' : `requestGapMs:${platform}`, gap * 1000);
          store.db.prepare('UPDATE targets SET interval_ms=?,history_gap_ms=? WHERE platform=?').run(interval * 60000, history * 1000, platform);
          store.setSetting(platform === 'weibo' ? 'targetDefaults' : `targetDefaults:${platform}`, { intervalMs: interval * 60000, historyGapMs: history * 1000 });
        })();
        platformWorker.requestGapMs = gap * 1000;
        platformWorker.rescheduleUpdates();
      } else {
        const match = path.match(/^\/jobs\/([a-f0-9-]+)\/(pause|resume)$/);
        if (!match || !store.job(match[1])) return json(res, 404, { error: '任务不存在' });
        const job = store.job(match[1]);
        if (body.enableTarget !== undefined && typeof body.enableTarget !== 'boolean') return json(res, 400, { error: '无效的博主开关值' });
        if (match[2] === 'resume' && store.target(job.uid).capture_mode === 'pending') return json(res, 409, { error: '请先确认记录方式' });
        if (match[2] === 'resume' && job.status === 'complete') {
          return json(res, 409, { error: '历史任务已到可访问末尾；更新任务仍会持续检查' });
        }
        store.transaction(() => {
          if (match[2] === 'resume' && body.enableTarget === true) enableAuthorJob(job.uid, job.kind);
          if (match[2] === 'resume' && job.kind === 'history') store.setSetting('historyRequested:' + job.uid, true);
          store.updateJob(job.id, { status: match[2] === 'pause' ? 'paused' : 'queued', message: match[2] === 'pause' ? '已手动暂停，断点保留' : '等待继续；账号冷却仍然有效' });
        })();
      }
      const clockChanges = ['/targets/start', '/monitoring', '/verify'].includes(path) || path.startsWith('/jobs/') && path.endsWith('/resume') && store.job(path.split('/')[2])?.kind === 'updates';
      Object.values(sources).forEach(source => { if (clockChanges) source.worker.rescheduleUpdates(); source.worker.wake(); });
      documents.drainImages();
      return json(res, 200, { ok: true });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      return json(res, error.kind === 'wait' ? 429 : 400, { kind: error.kind, retryAfterMs: error.kind === 'wait' ? error.retryAfter : undefined, error: error.kind === 'wait' ? `请等待 ${Math.ceil(error.retryAfter / 1000)} 秒后再试` : error.kind ? error.message : '操作失败，请检查输入、浏览器是否打开及数据目录权限' });
    }
  }

  function start() {
      if (Object.values(sources).every(source => source.worker.timer && !source.worker.stopping)) return;
      try {
        Object.values(sources).forEach(source => { source.worker.stopping = false; source.worker.start(); });
        serviceError = '';
      }
      catch (error) {
        serviceError = error.message;
        Object.values(sources).forEach(source => { source.worker.stopping = true; source.worker.running = false; clearTimeout(source.worker.timer); });
        return;
      }
      agent.start();
      void documents.sync({ incremental: true }).catch(() => { documents.error = '启动文档补写中断，正文已保留，可在设置中重试'; });
      void documents.drainImages();
  }
  return {
    get store() { return store; }, get documents() { return documents; }, updates, agent, worker, browser, sources, handle, start,
    async close() {
      if (closing) return;
      closing = true;
      if (workspaceTask) await workspaceTask.catch(() => {});
      documents.stopping = true;
      await Promise.all([agent.close(), avatars.close(), ...Object.values(sources).map(source => source.worker.stop())]);
      if (documents.task) await documents.task;
      if (documents.queueTask) await documents.queueTask;
      await Promise.allSettled([...documents.imageTasks.values()]);
      await Promise.all(Object.values(sources).map(source => source.browser.close()));
      store.close();
    },
  };
}

export function apply(ctx) {
  const updates = createUpdates({ getService: key => { try { return ctx.get(key); } catch { return null; } } });
  let im = null;
  ctx.inject(['dshIm'], ready => {
    im = ready.dshIm;
    ready.effect(() => () => { im = null; });
  });
  ctx.effect(() => {
    let runtime;
    let startupError;
    try { runtime = createRuntime(undefined, { getIM: () => im, updates }); runtime.start(); }
    catch { startupError = '无法打开本地资料库，请检查信息保存位置和文件权限后重新启用插件'; }
    const unregister = ctx.webServer.register({ kind: 'prefix', path: PREFIX,
      handler: (req, res) => startupError ? json(res, 503, { error: startupError }) : runtime.handle(req, res) });
    return async () => { unregister(); if (runtime) await runtime.close(); };
  }, 'dsh-social-trace: 本地采集与档案服务');
}
