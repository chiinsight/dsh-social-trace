import { mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { platformImage, platformImages, imageReferer } from './text.js';

const safeName = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
const imageName = url => createHash('sha256').update(url).digest('hex').slice(0, 24) + (/^\.(jpe?g|png|gif|webp)$/i.test(extname(new URL(url).pathname)) ? extname(new URL(url).pathname).toLowerCase() : '.jpg');
const imageType = bytes => bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
  : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
  : /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()) ? 'image/gif'
  : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;

export class Documents {
  constructor(store, workspace) {
    this.store = store;
    this.directory = join(workspace, 'documents');
    this.error = '';
    this.mediaError = store.getSetting('mediaBackupPending', false) ? '部分配图待同步，可手动重试图片备份' : '';
    this.syncing = false;
    this.task = null;
    this.stopping = false;
    this.imageTasks = new Map();
    this.imageQueue = new Map();
    this.queueTask = null;
    const pending = store.getSetting('mediaQueueIds', []).slice(0, 32);
    for (const post of store.posts({ ids: pending, limit: 32 })) this.imageQueue.set(post.id, { ...post, captureKind: post.capture_kind || null });
  }

  authorDirectory(uid) {
    const target = this.store.target(uid);
    if (!target) throw new Error('博主不存在');
    const folder = join(this.directory, safeName(target.platform), safeName(target.external_uid));
    const legacy = join(this.directory, safeName(uid));
    mkdirSync(join(this.directory, safeName(target.platform)), { recursive: true, mode: 0o700 });
    if (!existsSync(folder) && existsSync(legacy)) renameSync(legacy, folder);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    return folder;
  }

  async image(uid, source) {
    const url = platformImage(source, this.store.target(uid)?.platform);
    if (!url) throw new Error('图片地址无效');
    const path = join(this.authorDirectory(uid), 'images', imageName(url));
    const existing = this.imageTasks.get(path);
    if (existing) return existing;
    const task = (async () => {
      if (existsSync(path)) {
        const bytes = readFileSync(path), type = imageType(bytes);
        if (type) return { bytes, type };
      }
      const response = await fetch(url, { headers: { Referer: imageReferer(url) }, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok || Number(response.headers.get('content-length')) > 12 * 1024 * 1024) throw new Error('图片暂不可用');
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 12 * 1024 * 1024) throw new Error('图片超过备份大小限制');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks), type = imageType(bytes);
      if (!type || bytes.length > 12 * 1024 * 1024) throw new Error('图片格式或大小不受支持');
      mkdirSync(join(this.authorDirectory(uid), 'images'), { recursive: true, mode: 0o700 });
      const temporary = path + '.' + randomUUID() + '.tmp';
      try { writeFileSync(temporary, bytes, { mode: 0o600 }); renameSync(temporary, path); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
      return { bytes, type };
    })();
    this.imageTasks.set(path, task);
    try { return await task; } finally { this.imageTasks.delete(path); }
  }

  enqueueImages(post, kind = post.capture_kind || null) {
    const images = [...(post.images || []), ...(post.quote?.images || [])];
    if (!images.length || images.every(url => existsSync(join(this.authorDirectory(post.uid), 'images', imageName(url))))) return;
    if (this.imageQueue.size >= 32 && !this.imageQueue.has(post.id)) {
      this.mediaError = '配图待同步：后台队列已满，可稍后手动重试图片备份';
      this.store.setSetting('mediaBackupPending', true);
      return;
    }
    this.imageQueue.set(post.id, { ...post, captureKind: kind });
    this.store.setSetting('mediaQueueIds', [...this.imageQueue.keys()]);
    this.drainImages();
  }

  canBackupImages(post) {
    const target = this.store.target(post.uid);
    const jobs = this.store.db.prepare('SELECT kind,status FROM jobs WHERE uid=?').all(post.uid);
    const account = target && this.store.account(target.platform);
    return target && this.store.monitoringEnabled(target.platform, post.uid)
      && account.status === 'ready' && account.cooldown_until <= Date.now()
      && (post.captureKind ? jobs.some(job => job.kind === (post.captureKind === 'catchup' ? 'updates' : post.captureKind) && (job.status === 'queued' || post.captureKind === 'history' && job.status === 'complete')) : jobs.length > 0 && jobs.every(job => job.status === 'queued'));
  }

  drainImages() {
    if (this.queueTask || this.stopping) return this.queueTask;
    this.queueTask = (async () => {
      while (!this.stopping) {
        const post = [...this.imageQueue.values()].find(post => this.canBackupImages(post));
        if (!post) return;
        if (await this.cacheImages(post, { respectMonitoring: true }) === false) return;
        this.imageQueue.delete(post.id);
        this.store.setSetting('mediaQueueIds', [...this.imageQueue.keys()]);
      }
    })().catch(() => { this.mediaError = '配图备份暂时中断，正文已保留，可稍后重试'; this.store.setSetting('mediaBackupPending', true); }).finally(() => { this.queueTask = null; });
    return this.queueTask;
  }

  async cacheImages(post, { respectMonitoring = false } = {}) {
    const images = [...(post.images || platformImages(post.raw, this.store.target(post.uid)?.platform)), ...(post.quote?.images || platformImages(post.raw?.retweeted_status, this.store.target(post.uid)?.platform))];
    for (const url of new Set(images)) {
      if (this.stopping || respectMonitoring && (!this.canBackupImages(post) || this.store.dueJob(Date.now(), this.store.target(post.uid)?.platform)?.kind === 'updates')) return false;
      try { await this.image(post.uid, url); }
      catch {
        if (respectMonitoring && !this.canBackupImages(post)) return false;
        if (!this.mediaError) this.store.notice('attention', '部分图片备份失败，正文已保留，可在保存设置中重试同步');
        this.mediaError = '部分图片尚未备份成功';
        this.store.setSetting('mediaBackupPending', true);
      }
    }
    return true;
  }

  save(post, { skipUnchanged = false } = {}) {
    let temporary;
    try {
      const folder = this.authorDirectory(post.uid);
      const filename = new Date(post.publishedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) + '-' + safeName(post.id) + '.md';
      const destination = join(folder, filename);
      if (skipUnchanged && existsSync(destination) && statSync(destination).mtimeMs >= post.last_seen_at) return true;
      const published = new Date(post.publishedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
      const pictures = images => images.map(url => `\n![配图](./images/${imageName(url)})\n`).join('');
      const content = `# ${post.author}\n\n发布时间：${published}（北京时间）\n\n来源：${post.url}\n\n正文状态：${post.article ? '文章仅保留标题和链接' : post.complete ? '完整' : '待补齐'}\n\n${post.text}\n`
        + pictures(post.images || platformImages(post.raw, this.store.target(post.uid)?.platform))
        + (post.quote ? `\n---\n\n转发原文 · ${post.quote.author}\n\n${post.quote.text}\n` + pictures(post.quote.images || platformImages(post.raw?.retweeted_status, this.store.target(post.uid)?.platform)) : '');
      temporary = join(folder, '.' + randomUUID() + '.tmp');
      writeFileSync(temporary, content, { mode: 0o600 });
      renameSync(temporary, join(folder, filename));
      this.error = '';
      return true;
    } catch {
      if (temporary) { try { unlinkSync(temporary); } catch { /* Nothing to clean up. */ } }
      if (!this.error) this.store.notice('attention', '文档写入失败：正文已保存在资料库中，请检查保存位置后重试同步');
      this.error = '文档写入失败，请检查文件夹权限和磁盘空间';
      return false;
    }
  }

  sync({ incremental = false, backgroundImages = false } = {}) {
    if (this.task) return this.task;
    this.syncing = true;
    if (!incremental && !backgroundImages) { this.mediaError = ''; this.store.setSetting('mediaBackupPending', false); }
    this.task = (async () => {
      let offset = 0;
      let cursor = this.store.getSetting('documentsCursor', { at: 0, id: '' });
      while (!this.stopping) {
        const posts = this.store.posts({ offset, limit: 100, modifiedAfter: incremental ? cursor : null });
        for (const post of posts) {
          if (this.stopping) return;
          const value = { ...post, publishedAt: post.published_at };
          if (!this.save(value, { skipUnchanged: incremental })) return;
          if (incremental || backgroundImages) this.enqueueImages(value);
          else await this.cacheImages(value);
        }
        if (posts.length && incremental) {
          const last = posts.at(-1);
          cursor = { at: last.last_seen_at, id: last.id };
          this.store.setSetting('documentsCursor', cursor);
        }
        if (posts.length < 100) return;
        if (!incremental) offset += posts.length;
        await setImmediate();
      }
    })().finally(() => { this.syncing = false; this.task = null; });
    return this.task;
  }
}
