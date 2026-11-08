import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { parseAuthor, plainText, normalizePost, decodeResponse, WeiboBrowser } from '../lib/platforms/weibo/index.js';
import { CaptureError } from '../lib/capture-error.js';

const uid = '1234567890';
const now = Date.parse('2026-11-05T06:00:00Z');
function raw(id = '10000000000000001', extra = {}) {
  return { idstr: id, user: { idstr: uid, screen_name: '测试博主' },
    created_at: 'Wed Nov 04 12:00:00 +0800 2026', text: '正文<br>测试 &amp; 归档', ...extra };
}
function harness(t, browser) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-test-'));
  const store = new Store(directory);
  store.addTarget(uid, uid, now);
  store.setAccount({ status: 'ready', reason: '' });
  const update = store.jobs().find(job => job.kind === 'updates');
  store.updateJob(update.id, { status: 'paused' });
  let time = now;
  const worker = new Worker(store, { normalizePost, isPinned: raw => !!(raw.isTop || raw.is_top || raw.top), complete: async post => post, ...browser }, { now: () => time });
  t.after(async () => { await worker.stop(); store.close(); rmSync(directory, { recursive: true }); });
  return { directory, store, worker, history: store.jobs().find(job => job.kind === 'history'),
    update, advance(ms = 60001) { time += ms; } };
}

test('历史任务先保存了刚发布的动态，新动态检查仍推送一次，不重复抓取正文', async t => {
  const record = raw('10000000000000098', { created_at: new Date(now + 1000).toISOString() });
  let completions = 0;
  const h = harness(t, { timeline: async () => ({ items: [record], end: true }), complete: async post => { completions++; return post; } });
  h.store.setSetting('agentDelivery', { enabled: true, botId: 'bot', targetId: 'target', uids: [] });
  h.store.savePost(normalizePost(record, uid), now + 1000, 'history', now + 1000);
  h.store.updateJob(h.history.id, { status: 'paused' });
  h.store.updateJob(h.update.id, { status: 'queued', next_run_at: 0 });
  for (let i = 0; i < 6; i++) { h.advance(); await h.worker.tick(); }
  assert.equal(completions, 0);
  assert.equal(h.store.count(), 1);
  assert.equal(h.store.db.prepare('SELECT COUNT(*) n FROM social_deliveries').get().n, 1);
});

test('仅缓存原创会跳过转发及其全文请求，转发页仍能推进；新动态不受历史筛选影响', async t => {
  let completeCalls = 0, pageCalls = [];
  const repost = raw('10000000000000002', { retweeted_status: { idstr: '10000000000000003', user: { screen_name: '原作者' }, text: '转发原文' } });
  const original = raw('10000000000000004');
  const h = harness(t, { timeline: async (_uid, page) => { pageCalls.push(page); return { items: page === 1 ? [repost] : [original], end: page === 2 }; }, complete: async post => { completeCalls++; return post; } });
  h.store.setSetting('historyOriginalOnly:' + uid, true);
  for (let i = 0; i < 8; i++) { await h.worker.tick(); h.advance(); }
  assert.deepEqual(pageCalls, [1, 2]);
  assert.equal(completeCalls, 1);
  assert.equal(h.store.hasPost(repost.idstr), false);
  assert.equal(h.store.hasPost(original.idstr), true);
  assert.equal(h.store.job(h.history.id).status, 'complete');
  assert.equal(h.store.targetProgress()[0].history.rangeSaved, 1);
  assert.equal(h.store.targetProgress()[0].history.estimatedRemaining, null);
  h.store.updateJob(h.update.id, { status: 'queued' });
  repost.created_at = new Date(now + 1000).toISOString();
  for (let i = 0; i < 4; i++) { await h.worker.tick(); h.advance(); }
  assert.equal(h.store.hasPost(repost.idstr), true);
  assert.equal(h.store.targetProgress()[0].history.rangeSaved, 1);
});

test('主页解析只接受微博数字 UID，拒绝其他域名与自定义跳转', () => {
  assert.equal(parseAuthor(`https://weibo.com/u/${uid}?from=profile`), uid);
  assert.equal(parseAuthor(uid), uid);
  for (const bad of ['https://evil.test/u/' + uid, 'file:///u/' + uid, 'https://weibo.com/username', 'https://weibo.com.evil.test/' + uid]) {
    assert.throws(() => parseAuthor(bad));
  }
});

test('公共调度器只依赖适配器，非微博字段与置顶判断也能归档', async t => {
  const records = [{ key: 'example:old', body: '旧文', pinned: true }, { key: 'example:new', body: '新文' }];
  const normalize = item => ({ id: item.key, uid, author: '独立平台测试', publishedAt: now - 1000,
    text: item.body, url: 'https://example.test/' + item.key, complete: true, quote: null, raw: item });
  const h = harness(t, {
    normalizePost: normalize, isPinned: item => !!item.pinned,
    timeline: async () => ({ items: records, end: true }),
  });
  h.store.savePost(normalize(records[0]));
  await h.worker.tick();
  assert.equal(h.store.job(h.history.id).checkpoint.foundKnown, false);
  for (let i = 0; i < 3; i++) await h.worker.tick();
  assert.equal(h.store.count(), 2);
  assert.equal(h.store.posts().find(post => post.id === 'example:new').text, '新文');
  assert.equal(h.store.job(h.history.id).status, 'complete');
});

test('保存纯文字、换行、表情和 HTML 实体，不执行来源脚本', () => {
  assert.equal(plainText('文字<br>第二行<img alt="[笑]" src="x">&amp;<script>bad()</script>'), '文字\n第二行[笑]&');
  assert.equal(normalizePost(raw(), uid).id, '10000000000000001');
  assert.throws(() => normalizePost(raw(undefined, { idstr: undefined, id: 10000000000000001 }), uid), /无损解析/);
});

for (const [response, kind] of [
  [{ status: 429, retryAfter: 90000 }, 'limited'],
  [{ status: 432 }, 'verification'],
  [{ status: 403 }, 'verification'],
  [{ status: 401 }, 'login'],
  [{ status: 200, body: null }, 'verification'],
  [{ status: 200, body: { ok: 0, msg: '请先登录' } }, 'login'],
  [{ status: 200, body: { ok: 0, msg: '访问频繁' } }, 'verification'],
  [{ status: 200, body: { ok: 1 } }, 'schema'],
]) test(`HTTP ${response.status} / ${kind} 不会被当成空时间线`, () => {
  assert.throws(() => decodeResponse(response), error => error.kind === kind);
});

test('历史页保存后再推进断点；重复帖子只存一份；限制范围留在任务说明', async t => {
  const calls = [];
  const h = harness(t, { timeline: async (_uid, page) => {
    calls.push(page);
    return page === 1 ? { items: [raw()], end: false } : { items: [raw()], end: true, endMessage: '仅展示半年内微博' };
  } });
  await h.worker.tick();
  assert.equal(h.store.count(), 0);
  assert.equal(h.store.job(h.history.id).checkpoint.page, 1);
  await h.worker.tick();
  assert.equal(h.store.count(), 1);
  await h.worker.tick();
  assert.equal(h.store.job(h.history.id).checkpoint.page, 2);
  h.advance();
  // Repeated pages are suspicious even when a terminal flag is returned.
  await h.worker.tick();
  assert.equal(h.store.job(h.history.id).status, 'needs_review');
  assert.equal(h.store.count(), 1);
  assert.deepEqual(calls, [1, 2]);
});

test('平台明确返回可访问末尾，保留范围说明，不宣称全部历史完整', async t => {
  const h = harness(t, { timeline: async () => ({ items: [raw()], end: true, endMessage: '仅展示半年内微博' }) });
  for (let i = 0; i < 3; i++) await h.worker.tick();
  const job = h.store.job(h.history.id);
  assert.equal(job.status, 'complete');
  assert.match(job.message, /半年/);
  assert.equal(h.store.notices().filter(item => /半年/.test(item.message)).length, 1);
});

test('空页没有末尾说明时暂停；不清空本地已有内容', async t => {
  const h = harness(t, { timeline: async () => ({ items: [], end: false }) });
  h.store.savePost(normalizePost(raw(), uid));
  await h.worker.tick();
  assert.equal(h.store.job(h.history.id).status, 'needs_review');
  assert.equal(h.store.count(), 1);
});

test('验证码暂停整个账号，其他任务不会继续尝试', async t => {
  let calls = 0;
  const h = harness(t, { timeline: async () => { calls++; throw new CaptureError('verification', '需要验证'); } });
  await h.worker.tick();
  h.advance(3600000);
  await h.worker.tick();
  assert.equal(calls, 1);
  assert.equal(h.store.account().status, 'needs_verification');
  assert.equal(h.store.job(h.history.id).checkpoint.page, undefined);
});

test('限流持久化冷却时间；手动恢复任务不会提前发请求', async t => {
  let calls = 0;
  const h = harness(t, { timeline: async () => { calls++; throw new CaptureError('limited', '限流', 600000); } });
  await h.worker.tick();
  h.advance(300000);
  h.store.updateJob(h.history.id, { status: 'queued', next_run_at: now });
  await h.worker.tick();
  assert.equal(calls, 1);
  h.advance(300001);
  await h.worker.tick();
  assert.equal(calls, 2);
});

test('长文失败后保留原页与待保存内容；恢复时不重抓时间线', async t => {
  let calls = 0, complete = false;
  const h = harness(t, {
    timeline: async () => { calls++; return { items: [raw(undefined, { isLongText: true })], end: true }; },
    complete: async post => {
      if (!complete) throw new CaptureError('verification', '需要验证');
      return { ...post, longTextContent: '已补齐的完整正文' };
    },
  });
  await h.worker.tick(); await h.worker.tick();
  assert.equal(h.store.count(), 0);
  assert.equal(h.store.job(h.history.id).checkpoint.pending.length, 1);
  complete = true;
  h.store.setAccount({ status: 'ready' });
  await h.worker.tick(); await h.worker.tick();
  assert.equal(calls, 1);
  assert.equal(h.store.posts()[0].text, '已补齐的完整正文');
  assert.equal(h.store.job(h.history.id).status, 'complete');
});

test('SQLite 重开后仍保留待保存页、中文检索和任务暂停状态', async t => {
  const h = harness(t, { timeline: async () => ({ items: [raw()], end: false }) });
  await h.worker.tick();
  h.store.updateJob(h.history.id, { status: 'paused' });
  const reopened = new Store(h.directory);
  assert.equal(reopened.job(h.history.id).checkpoint.pending.length, 1);
  assert.equal(reopened.job(h.history.id).status, 'paused');
  reopened.close();
  h.store.savePost(normalizePost(raw(), uid));
  assert.equal(h.store.posts({ query: '归档' }).length, 1);
  assert.equal(h.store.posts({ query: "' OR 1=1 --" }).length, 0);
});

test('手动暂停发生在请求途中时，不推进任务断点', async t => {
  let release;
  const h = harness(t, { timeline: () => new Promise(resolve => { release = resolve; }) });
  const running = h.worker.tick();
  h.store.updateJob(h.history.id, { status: 'paused' });
  release({ items: [raw()], end: false });
  await running;
  assert.equal(h.store.job(h.history.id).status, 'paused');
  assert.deepEqual(h.store.job(h.history.id).checkpoint, {});
});

test('同一档案库禁止两个采集实例同时运行', async t => {
  const h = harness(t, { timeline: async () => ({ items: [], end: false }) });
  h.worker.claim();
  const other = new Worker(h.store, {}, { now: () => now });
  assert.throws(() => other.claim(), /另一个/);
});

test('历史旧帖不提醒；新增动态落盘后提醒一次，重复扫描不重复提醒', async t => {
  const old = raw('10000000000000001');
  const fresh = raw('10000000000000002', { created_at: new Date(now + 1000).toISOString(), text: '新发布的动态' });
  const h = harness(t, { timeline: async () => ({ items: [fresh, old], end: true }) });
  for (let i = 0; i < 4; i++) await h.worker.tick();
  assert.equal(h.store.count(), 2);
  assert.equal(h.store.notices().filter(item => item.kind === 'update').length, 1);
  h.store.updateJob(h.update.id, { status: 'queued', next_run_at: now });
  for (let i = 0; i < 4; i++) await h.worker.tick();
  assert.equal(h.store.count(), 2);
  assert.equal(h.store.notices().filter(item => item.kind === 'update').length, 1);
});

test('请求在同一账号串行；提前调用只等待，不消耗下一次请求', async t => {
  const h = harness(t, {});
  await h.worker.beforeRequest();
  const scheduled = h.store.account().next_request_at;
  await assert.rejects(() => h.worker.beforeRequest(), error => error.kind === 'wait');
  assert.equal(h.store.account().next_request_at, scheduled);
  h.advance(15000);
  await h.worker.beforeRequest();
  assert.equal(h.store.account().next_request_at, scheduled + 15000);
});

test('转发原文补全文分两次请求时，第一份全文先持久化，下一次不重取', async t => {
  const post = raw(undefined, { isLongText: true, retweeted_status: {
    idstr: '10000000000000002', isLongText: true, text: '原文摘要', user: { screen_name: '原作者' },
  } });
  let calls = 0;
  const h = harness(t, {
    timeline: async () => ({ items: [post], end: true }),
    complete: async item => {
      calls++;
      const next = structuredClone(item);
      if (!next.longTextContent) next.longTextContent = '转发者全文';
      else next.retweeted_status.longTextContent = '被转发的完整原文';
      return next;
    },
  });
  await h.worker.tick(); await h.worker.tick();
  assert.equal(h.store.count(), 0);
  assert.equal(h.store.job(h.history.id).checkpoint.pending[0].longTextContent, '转发者全文');
  await h.worker.tick(); await h.worker.tick();
  assert.equal(calls, 2);
  assert.equal(h.store.posts()[0].quote.text, '被转发的完整原文');
});

test('重建采集实例后从待保存正文继续，不重复读取已持久化的页面', async t => {
  let calls = 0;
  const h = harness(t, { timeline: async () => { calls++; return { items: [raw()], end: true }; } });
  await h.worker.tick();
  await h.worker.stop();
  const restarted = new Worker(h.store, { normalizePost, complete: async post => post, timeline: async () => { throw new Error('不应重抓时间线'); } }, { now: () => now + 1000 });
  await restarted.tick(); await restarted.tick();
  await restarted.stop();
  assert.equal(calls, 1);
  assert.equal(h.store.count(), 1);
  assert.equal(h.store.job(h.history.id).status, 'complete');
});

test('历史归档遇到本地已有全文时，不再次请求长文接口', async t => {
  const h = harness(t, { timeline: async () => ({ items: [raw(undefined, { isLongText: true })], end: true }),
    complete: async () => { throw new Error('不应重复读取全文'); } });
  h.store.savePost(normalizePost(raw(undefined, { isLongText: true, longTextContent: '已经保存的全文' }), uid));
  for (let i = 0; i < 3; i++) await h.worker.tick();
  assert.equal(h.store.job(h.history.id).status, 'complete');
  assert.equal(h.store.posts()[0].text, '已经保存的全文');
});

test('总控、平台和博主暂停均阻止新请求，恢复上级保留下级暂停及断点', async t => {
  let calls = 0;
  const h = harness(t, { timeline: async () => { calls++; return { items: [raw()], end: true }; } });
  for (const key of ['monitorEnabled', 'platformEnabled:weibo', 'targetEnabled:' + uid]) {
    h.store.setSetting(key, false);
    await h.worker.tick();
    assert.equal(calls, 0);
    h.store.setSetting(key, true);
  }
  await h.worker.tick();
  assert.equal(calls, 1);
  const checkpoint = h.store.job(h.history.id).checkpoint;
  h.store.setSetting('targetEnabled:' + uid, false);
  h.store.setSetting('monitorEnabled', false);
  h.store.setSetting('monitorEnabled', true);
  await h.worker.tick();
  assert.equal(h.store.count(), 0);
  assert.deepEqual(h.store.job(h.history.id).checkpoint, checkpoint);
  h.worker.currentJobId = h.history.id;
  await assert.rejects(h.worker.beforeRequest(), error => error.kind === 'stopped');
  h.worker.currentJobId = null;
  h.store.setSetting('targetEnabled:' + uid, true);
  await h.worker.tick();
  assert.equal(h.store.count(), 1);
});

test('从真实微博作者字段保存昵称和圆形头像来源，拒绝非微博图片地址', async t => {
  const withAvatar = raw(undefined, { user: { idstr: uid, screen_name: '头像测试', avatar_hd: 'http://tva1.sinaimg.cn/crop/portrait.jpg' } });
  assert.equal(normalizePost(withAvatar, uid).avatar, 'https://tva1.sinaimg.cn/crop/portrait.jpg');
  assert.equal(normalizePost(raw(undefined, { user: { idstr: uid, avatar_hd: 'https://evil.test/a.png' } }), uid).avatar, null);
  const h = harness(t, { timeline: async () => ({ items: [withAvatar], end: true }) });
  await h.worker.tick();
  assert.equal(h.store.target(uid).name, '头像测试');
  assert.equal(h.store.target(uid).avatar_url, 'https://tva1.sinaimg.cn/crop/portrait.jpg');
  assert.equal(h.store.count(), 0);
});

test('新资料库不预置默认博主', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-test-'));
  const store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true }); });
  assert.equal(store.targets().length, 0);
});

test('进度使用去重后的保存数量，未知不记为零，当前可见末尾不当作全部历史', async t => {
  const h = harness(t, {});
  h.store.savePost(normalizePost(raw(), uid), now);
  h.store.savePost(normalizePost(raw(), uid), now + 1000);
  h.store.updateJob(h.history.id, { saved: 99, pages: 1, checkpoint: { reportedTotal: 10 } });
  let progress = h.store.targetProgress(now)[0];
  assert.equal(progress.saved, 1);
  assert.equal(progress.history.estimatedRemaining, 9);
  assert.equal(progress.lastSavedAt, now + 1000);
  assert.equal(progress.lastCheckedAt, null);
  h.store.updateJob(h.history.id, { checkpoint: {} });
  assert.equal(h.store.targetProgress(now)[0].history.estimatedRemaining, null);
  for (const reportedTotal of ['', false, -1]) {
    h.store.updateJob(h.history.id, { checkpoint: { reportedTotal } });
    assert.equal(h.store.targetProgress(now)[0].history.estimatedRemaining, null);
  }
  h.store.updateJob(h.history.id, { status: 'complete', checkpoint: { reportedTotal: 10 }, message: '仅展示半年内微博' });
  progress = h.store.targetProgress(now)[0];
  assert.equal(progress.history.estimatedRemaining, null);
  assert.equal(progress.history.message, '仅展示半年内微博');
});

test('最近成功检查时间只在成功完成检查后更新，网络失败不冒充成功', async t => {
  let failed = false;
  const h = harness(t, { timeline: async () => { if (failed) throw new CaptureError('network', '网络异常'); return { items: [], end: true }; } });
  h.store.updateJob(h.history.id, { status: 'paused' });
  h.store.updateJob(h.update.id, { status: 'queued' });
  await h.worker.tick();
  assert.equal(h.store.targetProgress(now)[0].lastCheckedAt, null);
  await h.worker.tick();
  assert.equal(h.store.targetProgress(now)[0].lastCheckedAt, now);
  failed = true; h.advance(16 * 60000);
  await h.worker.tick();
  assert.equal(h.store.targetProgress(now + 16 * 60000)[0].lastCheckedAt, now);
});

test('历史按北京时间日期范围归档，置顶旧帖不提前终止，越界页不记作异常', async t => {
  const records = [
    raw('10000000000000001', { created_at: '2020-01-01T00:00:00+08:00', isTop: true }),
    raw('10000000000000002', { created_at: '2026-11-05T00:00:00+08:00' }),
    raw('10000000000000003', { created_at: '2026-11-02T12:00:00+08:00' }),
    raw('10000000000000004', { created_at: '2026-11-01T00:00:00+08:00' }),
  ];
  const h = harness(t, { timeline: async (_uid, page) => ({ items: page === 1 ? records : [raw('10000000000000005', { created_at: '2026-10-31T23:59:59+08:00' })], end: false, total: 20 }) });
  h.store.db.prepare('UPDATE targets SET history_from=?,history_to=? WHERE uid=?').run(Date.parse('2026-11-01T00:00:00+08:00'), Date.parse('2026-11-03T23:59:59.999+08:00'), uid);
  for (let i = 0; i < 10; i++) { await h.worker.tick(); h.advance(); }
  assert.equal(h.store.count(), 2);
  assert.deepEqual(h.store.posts().map(post => post.id), ['10000000000000003', '10000000000000004']);
  assert.equal(h.store.job(h.history.id).status, 'complete');
  assert.equal(h.store.targetProgress(now)[0].history.rangeComplete, true);
  assert.equal(h.store.targetProgress(now)[0].history.estimatedRemaining, null);
});


test('从此刻记录排除首次检查中的旧微博，仍保存之后的新动态', async t => {
  const h = harness(t, { timeline: async () => ({ items: [raw('10000000000000001', { created_at: new Date(now - 60000).toISOString() }), raw('10000000000000002', { created_at: new Date(now + 1000).toISOString() })], end: true }) });
  h.store.db.prepare("UPDATE targets SET capture_mode='from_now',record_from=? WHERE uid=?").run(now, uid);
  h.store.updateJob(h.history.id, { status: 'paused' });
  h.store.updateJob(h.update.id, { status: 'queued' });
  for (let i = 0; i < 5; i++) { await h.worker.tick(); h.advance(); }
  assert.equal(h.store.count(), 1);
  assert.equal(h.store.posts()[0].id, '10000000000000002');
});


test('关闭微博标签后重新创建采集页，导航未完成时不会提前使用页面', async () => {
  const browser = new WeiboBrowser('/unused', async () => {});
  const closed = { isClosed: () => true };
  let navigations = 0;
  const page = { isClosed: () => false, url: () => 'https://weibo.com/', goto: async url => { assert.equal(url, 'https://weibo.com/'); navigations++; } };
  browser.context = { pages: () => [closed], newPage: async () => page };
  browser.page = closed;
  await browser.open();
  assert.equal(browser.page, page); assert.equal(navigations, 1);
  let release;
  browser.opening = new Promise(resolve => { release = resolve; });
  let ready = false;
  const opening = browser.open().then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  release(); await opening; assert.equal(ready, true);
});

test('浏览器关闭和启动错误给出具体恢复提示，不误报登录失效', async () => {
  const browser = new WeiboBrowser('/unused', async () => {});
  browser.open = async () => { throw new Error('Target page, context or browser has been closed'); };
  await assert.rejects(browser.login(), error => error.kind === 'network' && /页面已关闭/.test(error.message));
  await assert.rejects(browser.request('/ajax/test'), error => error.kind === 'login' && /授权缺失/.test(error.message));
  browser.open = async () => { throw new Error('browserType.launchPersistentContext: Executable not found'); };
  await assert.rejects(browser.login(), error => error.kind === 'network' && /Chrome/.test(error.message));
});

test('内部代码错误只暂停对应任务；跨模块错误保留平台原因', async t => {
  const h = harness(t, {});
  h.worker.fail(h.history, new TypeError('private internal details'));
  assert.equal(h.store.job(h.history.id).status, 'needs_review');
  assert.equal(h.store.account().status, 'ready');
  assert.equal(h.store.account().errors, 0);
  assert.equal(h.store.getSetting('lastFailure:weibo').code, 'TypeError');
  assert.doesNotMatch(h.store.job(h.history.id).message, /private internal details/);
  h.worker.fail(h.update, { kind: 'network', message: '微博网页连接超时' });
  assert.equal(h.store.account().reason, '微博网页连接超时');
});
