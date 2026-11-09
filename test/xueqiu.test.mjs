import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { createRuntime } from '../lib/index.js';
import { CaptureError } from '../lib/capture-error.js';
import { WeiboBrowser } from '../lib/platforms/weibo/index.js';
import { XueqiuBrowser, parseAuthor, decodeResponse, normalizePost } from '../lib/platforms/xueqiu/index.js';

const uid = '1234567890';
const now = Date.parse('2026-11-05T06:00:00Z');
const raw = (extra = {}) => ({ id: 415405843, user_id: Number(uid), user: { id: Number(uid), screen_name: '测试博主' },
  created_at: now - 1000, description: '正文<br>第二行 &amp; 内容', text: '正文<br>第二行 &amp; 内容', truncated: false, mark: 0, ...extra });
const directory = () => mkdtempSync(join(tmpdir(), 'social-trace-xueqiu-'));

test('雪球主页校验与正文解析，保留转发并识别未补齐正文', () => {
  for (const value of [uid, `https://xueqiu.com/u/${uid}`, `https://www.xueqiu.com/${uid}`]) assert.equal(parseAuthor(value), uid);
  for (const value of [`https://evil.test/u/${uid}`, `https://xueqiu.com/${uid}/123`, 'file:///12345']) assert.throws(() => parseAuthor(value));
  const post = normalizePost(raw({ text: '<script>alert(1)</script>原文 &amp; 内容', retweeted_status: raw({ id: 123 }) }), uid);
  assert.equal(post.text, '原文 & 内容');
  assert.equal(post.quote.id, '123');
  assert.equal(post.complete, true);
  assert.equal(normalizePost(raw({ truncated: true }), uid).complete, false);
  assert.equal(normalizePost(raw({ user_id: 12345 }), uid), null);
  assert.throws(() => normalizePost(raw({ id: Number.MAX_SAFE_INTEGER + 1 }), uid), /无损/);
});

for (const [response, kind] of [
  [{ status: 567 }, 'verification'], [{ status: 403 }, 'verification'], [{ status: 429, retryAfter: 60000 }, 'limited'],
  [{ status: 200, body: { error_code: '400016' } }, 'login'], [{ status: 200, body: { error_code: '110017' } }, 'verification'],
  [{ status: 200, body: null }, 'verification'], [{ status: 200, body: { error_code: 123 } }, 'schema'],
]) test(`雪球 HTTP/业务错误 ${response.status}/${response.body?.error_code || ''} 不记为空动态`, () => {
  assert.throws(() => decodeResponse(response), error => error.kind === kind);
});

test('雪球分页必须有明确边界，长文只有详情确认完整后才算补齐', async () => {
  const adapter = new XueqiuBrowser('/unused', () => {});
  adapter.request = async () => ({ statuses: [raw()], page: 1, maxPage: 2, total: 21 });
  assert.equal((await adapter.timeline(uid, 1)).end, false);
  adapter.request = async () => ({ statuses: [raw()], page: 2, maxPage: 2, total: 21 });
  assert.equal((await adapter.timeline(uid, 2)).end, true);
  adapter.request = async () => ({ statuses: [], page: 1 });
  await assert.rejects(adapter.timeline(uid, 1), /分页字段/);
  adapter.request = async () => raw({ text: '完整正文', truncated: false });
  assert.equal(normalizePost(await adapter.complete(raw({ truncated: true })), uid).complete, true);
  adapter.request = async () => raw({ truncated: true });
  await assert.rejects(adapter.complete(raw({ truncated: true })), /完整正文/);
});

test('同库中跨平台相同作者/帖子 ID 不冲突，账号节奏和异常互不影响', async t => {
  const path = directory();
  const store = new Store(path);
  for (const platform of ['weibo', 'xueqiu']) {
    store.addTarget(uid, platform, now, platform);
    store.setAccount({ status: 'ready', reason: '' }, platform);
    const update = store.jobs().find(job => job.uid === store.authorKey(uid, platform) && job.kind === 'updates');
    store.updateJob(update.id, { status: 'paused' });
  }
  const adapter = id => ({ id, normalizePost, isPinned: item => item.mark === 1,
    complete: async item => item, timeline: async () => ({ items: [raw()], end: true }) });
  const weibo = new Worker(store, adapter('weibo'), { now: () => now });
  const snow = new Worker(store, adapter('xueqiu'), { now: () => now });
  t.after(async () => { await weibo.stop(); await snow.stop(); store.close(); rmSync(path, { recursive: true }); });
  for (let i = 0; i < 3; i++) { await weibo.tick(); await snow.tick(); }
  assert.equal(store.count(), 2);
  assert.deepEqual(new Set(store.posts().map(post => post.id)), new Set(['415405843', 'xueqiu:415405843']));
  assert.deepEqual(new Set(store.posts().map(post => post.uid)), new Set([uid, 'xueqiu:' + uid]));
  await snow.beforeRequest();
  assert.equal(store.account('weibo').next_request_at, 0);
  assert.equal(store.account('xueqiu').next_request_at, now + 15000);
  snow.fail(store.jobs().find(job => job.uid.startsWith('xueqiu:')), new CaptureError('verification', '测试验证'));
  assert.equal(store.account('xueqiu').status, 'needs_verification');
  assert.equal(store.account('weibo').status, 'ready');
});

test('旧版数据库的作者 ID、正文、任务和暂停状态在升级后保留', t => {
  const path = directory();
  const old = new Store(path);
  old.addTarget(uid, '原有博主', now);
  old.setAccount({ status: 'paused', reason: '保留原暂停状态', cooldown_until: now + 1000 });
  old.savePost(normalizePost(raw(), uid));
  const jobIds = old.jobs().map(job => job.id);
  old.close();
  const db = new DatabaseSync(join(path, 'archive.sqlite'));
  db.exec('ALTER TABLE targets DROP COLUMN external_uid; ALTER TABLE targets DROP COLUMN platform;'); db.close();
  const migrated = new Store(path); t.after(() => { migrated.close(); rmSync(path, { recursive: true }); });
  assert.equal(migrated.target(uid).external_uid, uid);
  assert.equal(migrated.target(uid).platform, 'weibo');
  assert.equal(migrated.posts()[0].id, '415405843');
  assert.deepEqual(migrated.jobs().map(job => job.id), jobIds);
  assert.equal(migrated.account().reason, '保留原暂停状态');
  assert.equal(migrated.account().cooldown_until, now + 1000);
  assert.equal(migrated.account('xueqiu').status, 'needs_login');
});

test('平台选择通过真实 HTTP 接口传递，设置和授权只改变对应平台', async t => {
  class TestWeibo extends WeiboBrowser { async checkLogin() { return '1234567890'; } }
  class TestXueqiu extends XueqiuBrowser { async checkLogin() { return '9876543210'; } }
  const path = directory();
  const runtime = createRuntime(path, { adapterFactories: { weibo: TestWeibo, xueqiu: TestXueqiu } });
  assert.equal(runtime.sources.xueqiu.worker.requestGapMs, 30000);
  assert.equal(runtime.store.getSetting('targetDefaults:xueqiu').historyGapMs, 120000);
  const server = createServer(runtime.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await runtime.close(); rmSync(path, { recursive: true }); });
  const base = `http://127.0.0.1:${server.address().port}/dsh-social-trace`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify(body) });
  for (const platform of ['weibo', 'xueqiu']) assert.equal((await post('/targets', { platform, url: uid })).status, 200);
  assert.equal((await post('/verify', { platform: 'xueqiu' })).status, 200);
  assert.equal(runtime.store.account().status, 'needs_login');
  assert.equal(runtime.store.account('xueqiu').status, 'ready');
  assert.equal((await post('/settings', { platform: 'xueqiu', requestGapSeconds: 30, historyGapSeconds: 120, intervalMinutes: 20 })).status, 200);
  assert.equal(runtime.sources.xueqiu.worker.requestGapMs, 30000);
  assert.equal((await post('/settings', { platform: 'xueqiu', requestGapSeconds: 15 })).status, 400);
  assert.equal(runtime.sources.xueqiu.worker.requestGapMs, 30000);
  assert.equal(runtime.sources.weibo.worker.requestGapMs, 15000);
  assert.equal(runtime.store.target(uid).interval_ms, 900000);
  assert.equal(runtime.store.target('xueqiu:' + uid).interval_ms, 1200000);
  const status = await (await fetch(base + '/status')).json();
  assert.deepEqual(status.platforms.map(platform => platform.id), ['weibo', 'xueqiu']);
  assert.equal(status.targets.find(target => target.platform === 'xueqiu').external_uid, uid);
  assert.equal((await post('/targets', { platform: 'x', url: uid })).status, 400);
});


test('雪球连接异常提醒独立去重，恢复只取消雪球提醒', t => {
  const path = directory(), store = new Store(path);
  t.after(() => { store.close(); rmSync(path, { recursive: true, force: true }); });
  store.setSetting('agentDelivery', { enabled: true, botId: 'mock', targetId: 'mock', uids: [] });
  for (const platform of ['weibo', 'xueqiu']) {
    store.setAccount({ status: 'needs_verification', reason: '需要验证' }, platform, true);
    store.setAccount({ status: 'needs_verification', reason: '需要验证' }, platform, true);
  }
  const deliveries = () => store.db.prepare('SELECT * FROM social_deliveries').all();
  assert.equal(deliveries().length, 2);
  assert.match(deliveries().find(d => d.uid === 'platform:xueqiu').message, /雪球/);
  store.setAccount({ status: 'ready' }, 'xueqiu');
  assert.equal(deliveries().find(d => d.uid === 'platform:xueqiu').status, 'cancelled');
  assert.equal(deliveries().find(d => d.uid === 'platform:weibo').status, 'queued');
  store.setAccount({ status: 'needs_login' }, 'xueqiu', true);
  assert.equal(deliveries().length, 3);
});

test('雪球文章元信息经统一资料库往返保留链接标记，不把正文或摘要写入 raw', t => {
  const path = directory(), store = new Store(path);
  t.after(() => { store.close(); rmSync(path, { recursive: true, force: true }); });
  store.addTarget(uid, '作者', now, 'xueqiu');
  const post = normalizePost(raw({ type: '3', title: '文章标题', text: '不要保存正文', description: '不要保存摘要', truncated: true }), uid);
  store.savePost({ ...post, uid: 'xueqiu:' + uid, id: 'xueqiu:' + post.id });
  const saved = store.posts()[0];
  assert.equal(saved.article, true);
  assert.equal(saved.text, `文章标题\n\n文章链接：https://xueqiu.com/${uid}/${post.id}`);
  assert.deepEqual(saved.images, []);
  const source = JSON.parse(store.db.prepare('SELECT raw FROM posts').get().raw);
  assert.equal(Object.hasOwn(source, 'text'), false);
  assert.equal(Object.hasOwn(source, 'description'), false);
});
