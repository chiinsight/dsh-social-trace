import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../lib/store.js';
import { Documents } from '../lib/documents.js';
import { Worker } from '../lib/worker.js';
import { normalizePost, parseAuthor, decodeList, mediaURL } from '../lib/platforms/douyin/data.js';
import { DouyinBrowser, parseResponse } from '../lib/platforms/douyin/index.js';
import { defaultConfig, validateConfig, nextCheckAt, configFor } from '../lib/platforms/douyin/config.js';
import { VideoLibrary } from '../lib/platforms/douyin/library.js';

const external = 'MS4w' + 'A'.repeat(40), uid = 'douyin:' + external;
const at = Date.parse('2026-11-11T19:00:00+08:00');
const raw = (id = '90071992547409931', extra = {}) => ({ aweme_id: id, author: { sec_uid: external, nickname: '抖音测试博主' }, create_time: at / 1000 + 60,
  desc: '测试视频', video: { duration: 120000, play_addr: { url_list: ['https://v1.douyinvod.com/fixture.mp4?signature=SYNTHETIC'] } },
  chapter_review_status: 2, chapter_abstract: '平台归纳', chapter_list: [{ timestamp: 65000, desc: '章节标题', detail: '章节要点' }], ...extra });
const mp4 = () => { const bytes = Buffer.alloc(2048); bytes.write('ftyp', 4); return bytes; };
function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-douyin-'));
  const store = new Store(directory), documents = new Documents(store, directory);
  store.addTarget(external, '抖音测试博主', at, 'douyin', { archiveHistory: false, captureMode: 'from_now' });
  store.setAccount({ status: 'ready' }, 'douyin');
  const videos = new VideoLibrary(() => store, () => documents, options);
  const save = data => { const post = normalizePost(data, external); store.savePost({ ...post, uid, id: 'douyin:' + post.id }, at + 120000, 'updates', at + 90000); return 'douyin:' + post.id; };
  t.after(async () => { await videos.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, store, documents, videos, save };
}

test('抖音主页和媒体URL校验，作品大整数ID无损，摘要与原文分开', () => {
  assert.equal(parseAuthor('https://www.douyin.com/user/' + external), external);
  assert.equal(mediaURL('https://p3-pc.douyinpic.com/fixture.jpg'), 'https://p3-pc.douyinpic.com/fixture.jpg');
  for (const value of ['12345', 'https://douyin.com.evil.test/user/' + external, 'https://evil.test/user/' + external]) assert.throws(() => parseAuthor(value));
  for (const value of ['http://v1.douyinvod.com/a', 'https://127.0.0.1/a', 'https://douyinvod.com.evil.test/a', 'https://u:pass@douyin.com/a', 'https://douyin.com:444/a']) assert.equal(mediaURL(value), null);
  const parsed = parseResponse('{"aweme_id":90071992547409931,"max_cursor":90071992547409932}');
  assert.equal(parsed.aweme_id, '90071992547409931'); assert.equal(parsed.max_cursor, '90071992547409932');
  const post = normalizePost(raw(), external);
  assert.equal(post.text, '测试视频'); assert.equal(post.video.summary.chapters[0].atMs, 65000);
  assert.equal(post.video.summary.origin, 'platform_ai'); assert.equal(post.video.summary.status, 'available');
  assert.equal(normalizePost(raw(), 'other'), null);
  assert.throws(() => normalizePost(raw(90071992547409930), external), /ID/);
  assert.equal(normalizePost(raw(undefined, { chapter_review_status: 0 }), external).video.summary.status, 'unconfirmed');
  assert.equal(normalizePost(raw(undefined, { chapter_abstract: '', chapter_list: [] }), external).video.summary.status, 'not_returned');
});

test('抖音分页需明确成功、末尾和游标，异常不能当没有更新', () => {
  assert.equal(decodeList({ status_code: 0, aweme_list: [], has_more: 0 }).end, true);
  assert.equal(decodeList({ status_code: 0, aweme_list: [raw()], has_more: 1, max_cursor: '100' }).nextCursor, '100');
  for (const body of [null, {}, { status_code: 403, aweme_list: [] }, { status_code: 0, aweme_list: [] }, { status_code: 0, aweme_list: [], has_more: 1 }]) assert.throws(() => decodeList(body));
});

test('每天多时间点按北京时间对齐，工作日跨周末，配置不使用分钟轮询', () => {
  const config = validateConfig({ times: ['20:00', '12:00'], repeat: 'daily' });
  assert.equal(nextCheckAt(config, Date.parse('2026-11-11T11:59:00+08:00')), Date.parse('2026-11-11T12:00:00+08:00'));
  assert.equal(nextCheckAt(config, Date.parse('2026-11-11T20:00:00+08:00')), Date.parse('2026-11-12T12:00:00+08:00'));
  assert.equal(nextCheckAt({ ...config, repeat: 'weekdays' }, Date.parse('2026-11-13T20:00:00+08:00')), Date.parse('2026-11-16T12:00:00+08:00'));
  for (const value of [{ times: [] }, { times: ['24:00'] }, { maxFileMB: 1 }, { threads: 64 }, { transcribe: 'yes' }, { python: 'python3;echo secret' }, { modelPath: 'relative/path' }]) assert.throws(() => validateConfig(value));
});

test('同名作品按作品ID独立保存、解析和转写可检索，不泄露下载签名', t => {
  const h = setup(t), first = h.save(raw()), second = h.save(raw('90071992547409932'));
  assert.notEqual(first, second); assert.equal(h.store.count(), 2);
  const post = h.store.posts({ ids: [first] })[0];
  assert.equal(post.video.summary.abstract, '平台归纳'); assert.equal(post.video.stages.video, 'not_requested');
  assert.doesNotMatch(JSON.stringify(post), /signature|SYNTHETIC|videoURL/);
  assert.equal(h.store.posts({ query: '章节要点' }).length, 2);
  h.documents.save({ ...post, publishedAt: post.published_at });
  const file = readdirSync(h.documents.authorDirectory(uid)).find(name => name.endsWith('.md'));
  assert.match(readFileSync(join(h.documents.authorDirectory(uid), file), 'utf8'), /平台 AI 解析（非作者逐字原文）/);
});

test('关闭平台解析不保存新摘要，平台默认不会覆盖博主独立配置', t => {
  const h = setup(t);
  h.store.setSetting('douyinConfig', validateConfig({ platformAI: false }));
  const id = h.save(raw());
  assert.equal(h.store.posts({ ids: [id] })[0].video.summary.status, 'disabled');
  assert.doesNotMatch(h.store.db.prepare('SELECT raw FROM posts WHERE id=?').get(id).raw, /平台归纳/);
  h.store.setSetting('douyinConfig:' + uid, validateConfig({ times: ['11:00'], platformAI: true }));
  h.store.setSetting('douyinConfig', validateConfig({ times: ['09:00'] }));
  assert.deepEqual(configFor(h.store, uid).times, ['11:00']);
  h.store.setSetting('douyinConfig:' + uid, null);
  assert.deepEqual(configFor(h.store, uid).times, ['09:00']);
});

test('监控Worker到指定时刻检查，作品去重并安排下次日历时间', async t => {
  const h = setup(t); let clock = at, calls = 0;
  h.store.setSetting('douyinConfig', validateConfig({ times: ['20:00'] }));
  const adapter = { id: 'douyin', normalizePost, needsRequest: () => false, complete: async value => value,
    timeline: async () => { calls++; return { items: [raw()], end: true }; }, isPinned: () => false };
  const worker = new Worker(h.store, adapter, { now: () => clock, documents: h.documents });
  worker.claim(); worker.rescheduleUpdates();
  await worker.tick(); assert.equal(calls, 0);
  clock = Date.parse('2026-11-11T20:00:00+08:00');
  for (let step = 0; step < 4; step++) await worker.tick();
  assert.equal(calls, 1); assert.equal(h.store.count(), 1);
  const job = h.store.jobs().find(job => job.kind === 'updates');
  assert.equal(job.next_run_at, Date.parse('2026-11-12T20:00:00+08:00'));
});

test('视频下载原子写入、不发送Cookie，成功后不重复下载', async t => {
  let calls = 0;
  const h = setup(t, { fetchImpl: async (url, options) => { calls++; assert.equal(options.headers.Cookie, undefined); return new Response(mp4(), { headers: { 'Content-Type': 'video/mp4' } }); } });
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: true }));
  const id = h.save(raw()); await h.videos.tick();
  const post = h.store.posts({ ids: [id] })[0]; assert.equal(post.video.stages.video, 'done');
  const row = h.store.db.prepare('SELECT * FROM video_records WHERE post_id=?').get(id);
  const paths = h.videos.paths(row); assert.equal(statSync(paths.video).size, 2048);
  assert.equal(readdirSync(paths.directory).some(name => name.endsWith('.part')), false);
  await h.videos.tick(); assert.equal(calls, 1);
  assert.match(readFileSync(join(h.documents.authorDirectory(uid), readdirSync(h.documents.authorDirectory(uid)).find(name => name.endsWith('.md'))), 'utf8'), /本地视频/);
});

test('下载失败不会把目录或残缺文件当成功，需要重试后才继续', async t => {
  let good = false, calls = 0;
  const h = setup(t, { fetchImpl: async () => { calls++; return new Response(good ? mp4() : Buffer.alloc(2048, 60)); } });
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: true }));
  const id = h.save(raw()); await h.videos.tick();
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.video, 'failed');
  await h.videos.tick(); assert.equal(calls, 1);
  good = true; h.videos.retry(id); await h.videos.tick();
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.video, 'done');
});

test('媒体重定向到外部或本机地址被阻止，不携带登录Cookie', async t => {
  let calls = 0;
  const h = setup(t, { fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }); } });
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: true }));
  const id = h.save(raw()); await h.videos.tick();
  assert.equal(calls, 1); assert.equal(h.store.posts({ ids: [id] })[0].video.stages.video, 'failed');
});

test('本地转写无模型时仅标需配置，不阻塞正文与平台AI，不下载模型', async t => {
  let calls = 0;
  const h = setup(t, { fetchImpl: async () => { calls++; throw new Error('must not fetch'); } });
  h.store.setSetting('douyinConfig', validateConfig({ transcribe: true }));
  const id = h.save(raw()); await h.videos.tick();
  const post = h.store.posts({ ids: [id] })[0];
  assert.equal(post.video.stages.transcription, 'needs_setup'); assert.equal(post.video.summary.status, 'available'); assert.equal(calls, 0);
});

test('音轨提取与转写独立串行，只保留选定资产，文字稿可检索', async t => {
  const programs = [];
  const h = setup(t, { fetchImpl: async () => new Response(mp4()), processImpl: async (program, args) => {
    programs.push({ program, args });
    if (program === 'ffmpeg') { const wav = Buffer.alloc(128); wav.write('RIFF'); wav.write('WAVE', 8); writeFileSync(args.at(-1), wav); return ''; }
    return JSON.stringify({ text: '本地识别到的观点' });
  } });
  const model = join(h.directory, 'fixture-model'); mkdirSync(model); writeFileSync(join(model, 'model.pt'), 'SYNTHETIC_MODEL');
  h.store.setSetting('douyinConfig', validateConfig({ transcribe: true, modelPath: model }));
  const id = h.save(raw()); await h.videos.tick();
  const post = h.store.posts({ ids: [id] })[0];
  assert.equal(post.video.stages.transcription, 'done'); assert.equal(post.video.videoAvailable, false); assert.equal(post.video.audioAvailable, false);
  assert.equal(programs.length, 2); assert.equal(programs[0].program, 'ffmpeg');
  assert.equal(h.store.posts({ query: '识别到的观点' }).length, 1);
  assert.equal(readdirSync(h.videos.paths(h.store.db.prepare('SELECT * FROM video_records WHERE post_id=?').get(id)).directory).length, 0);
});

test('关闭总控能取消下载，进度不标成功；重开后仍可继续', async t => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const h = setup(t, { fetchImpl: async (url, { signal }) => { entered(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); } });
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: true }));
  const id = h.save(raw()), work = h.videos.tick(); await ready;
  h.store.setSetting('monitorEnabled', false); h.videos.cancelInactive(); await work;
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.video, 'queued');
  await h.videos.tick(); assert.equal(h.videos.busy, null);
});

test('抖音授权缺失时不自动开窗；主动授权独立保存，后台只使用无头窗口', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-douyin-browser-'));
  const launches = [], sessions = { cookies: [{ name: 'uid_tt', value: 'SYNTHETIC_IDENTITY', domain: '.douyin.com', expires: -1 }, { name: 'sessionid', value: 'SYNTHETIC_SESSION', domain: '.douyin.com', expires: -1 }], origins: [] };
  const adapter = new DouyinBrowser(directory, async () => {});
  t.after(async () => { await adapter.close(); rmSync(directory, { recursive: true, force: true }); });
  t.mock.method(chromium, 'launchPersistentContext', async (path, options) => {
    launches.push({ path, options });
    return { on() {}, pages: () => [{ goto: async () => {} }], storageState: async () => sessions, close: async () => {} };
  });
  t.mock.method(chromium, 'launch', async options => {
    launches.push({ options }); let onResponse;
    const page = { close: async () => {}, on: (name, callback) => { onResponse = callback; }, goto: async () => {
      await onResponse({ url: () => 'https://www-hj.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=' + external + '&max_cursor=0', status: () => 200, text: async () => JSON.stringify({ status_code: 0, aweme_list: [raw()], has_more: 0 }) });
    } };
    return { newContext: async () => ({ newPage: async () => page }), close: async () => {} };
  });
  await assert.rejects(adapter.checkLogin(), error => error.kind === 'login');
  await assert.rejects(adapter.timeline(external, 1), error => error.kind === 'login'); assert.equal(launches.length, 0);
  await adapter.login(); await adapter.checkLogin();
  assert.equal(statSync(adapter.sessionFile).mode & 0o777, 0o600);
  assert.equal(launches[0].path, join(directory, 'douyin-browser')); assert.equal(launches[0].options.headless, false);
  const result = await adapter.timeline(external, 1); assert.equal(result.items.length, 1);
  assert.equal(launches.length, 2); assert.equal(launches[1].options.headless, true); assert.equal(launches[1].options.channel, undefined, '后台使用专用 headless shell，不能启动完整 Chrome 应用'); assert.equal(launches[1].options.args, undefined);
});

test('视频任务重启恢复、选项关闭与重新启用保持已完成文件', async t => {
  const h = setup(t, { fetchImpl: async () => new Response(mp4()) });
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: true, transcribe: true }));
  const id = h.save(raw()); await h.videos.tick();
  h.videos.patch(id, { transcript_status: 'running' }); h.videos.recover();
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.transcription, 'queued');
  h.store.setSetting('douyinConfig', validateConfig({ saveVideo: false, transcribe: false })); h.videos.configure();
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.transcription, 'not_requested');
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.video, 'done');
  h.store.setSetting('douyinConfig', validateConfig({ transcribe: true })); h.videos.configure();
  assert.equal(h.store.posts({ ids: [id] })[0].video.stages.transcription, 'queued');
  assert.equal(h.store.posts({ kind: 'video' }).length, 1); assert.equal(h.store.posts({ kind: 'images' }).length, 0);
});

test('转写环境允许中文完整路径，拒绝把命令参数或换行当作程序路径', () => {
  assert.equal(validateConfig({ python: '/tmp/中文环境/bin/python', ffmpeg: '/tmp/视频工具/ffmpeg' }).python, '/tmp/中文环境/bin/python');
  for (const python of ['python3 --version', '-python', 'python\nnext', '']) assert.throws(() => validateConfig({ python }));
});

test('抖音没有作品响应是可恢复加载超时，不误报人工验证', async t => {
  const adapter = new DouyinBrowser('/tmp/synthetic-douyin', async () => {});
  let releases = 0, clock = 0;
  t.mock.method(Date, 'now', () => clock += 40000);
  adapter.openAuthor = async () => {};
  adapter.release = async () => { releases++; };
  await assert.rejects(adapter.timeline(external, 1), error => error.kind === 'network' && /自动重试/.test(error.message));
  assert.equal(releases, 1);
});

test('抖音已明确要求验证时保留人工验证状态', async () => {
  const adapter = new DouyinBrowser('/tmp/synthetic-douyin', async () => {});
  adapter.openAuthor = async () => { adapter.responses = [{ cursor: '0', error: { kind: 'verification', message: '需要验证码' } }]; };
  adapter.release = async () => {};
  await assert.rejects(adapter.timeline(external, 1), error => error.kind === 'verification');
});

test('抖音旧版加载超时自行复查已有授权，手动暂停及验证码不恢复', async t => {
  const h = setup(t); let checks = 0, now = at;
  h.store.setAccount({ uid: 'SYNTHETIC_ACCOUNT', status: 'needs_verification', reason: '未收到抖音作品列表，可能是页面加载或平台验证问题；已停止并保留进度' }, 'douyin');
  const worker = new Worker(h.store, { id: 'douyin', checkLogin: async () => { checks++; return 'SYNTHETIC_ACCOUNT'; } }, { now: () => now });
  const history = h.store.jobs().find(job => job.kind === 'history');
  const notice = h.store.notice('attention', '抖音测试博主：' + h.store.account('douyin').reason, now, uid);
  await worker.tick();
  assert.equal(checks, 1); assert.equal(h.store.account('douyin').status, 'ready');
  assert.equal(h.store.job(history.id).status, 'paused');
  assert.ok(h.store.notices().find(row => row.id === notice).read_at);
  h.store.setAccount({ status: 'needs_verification', reason: '需要验证码' }, 'douyin');
  await worker.tick(); assert.equal(checks, 1);
  h.store.setAccount({ status: 'needs_verification', reason: '未收到抖音作品列表' }, 'douyin');
  h.store.setSetting('accountManualPause:douyin', true);
  await worker.tick(); assert.equal(checks, 1);
  await worker.stop();
});

test('抖音加载失败保留任务断点并自动退避，初次不打扰用户', async t => {
  const h = setup(t), worker = new Worker(h.store, { id: 'douyin' }, { now: () => at });
  const job = h.store.jobs().find(job => job.kind === 'updates');
  worker.fail(job, { kind: 'network', message: '抖音作品列表加载超时，已保留进度，将自动重试，无需重新登录' });
  assert.equal(h.store.job(job.id).status, 'queued');
  assert.ok(h.store.job(job.id).next_run_at > at);
  assert.equal(h.store.account('douyin').status, 'ready');
  assert.equal(h.store.notices().filter(row => row.kind === 'attention').length, 0);
  await worker.stop();
});
