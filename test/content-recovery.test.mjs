import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { CaptureError } from '../lib/capture-error.js';
import { normalizePost, WeiboBrowser } from '../lib/platforms/weibo/index.js';
import { createBusiness } from '../lib/business.js';

const uid = '1234567890', postId = '100000000001';
const raw = { idstr: postId, isLongText: true, text: '已读到的正文片段', user: { idstr: uid, screen_name: '测试博主' }, created_at: 'Wed Nov 04 12:00:00 +0800 2026' };
function fixture(t, complete) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-content-recovery-')), store = new Store(directory);
  let now = Date.parse('2026-11-11T10:00:00+08:00'), calls = 0;
  store.addTarget(uid, '测试博主', now, 'weibo'); store.setAccount({ status: 'ready' });
  const history = store.jobs().find(job => job.kind === 'history'), updates = store.jobs().find(job => job.kind === 'updates');
  store.updateJob(updates.id, { status: 'paused' });
  store.updateJob(history.id, { checkpoint: { page: 1, pageLoaded: true, pending: [raw] }, next_run_at: 0 });
  const adapter = { id: 'weibo', normalizePost, needsRequest: () => true, complete: async post => { calls++; if (complete) return complete(post); throw Object.assign(new CaptureError('content', '微博暂时没有返回这条内容的全文'), { postId }); } };
  const worker = new Worker(store, adapter, { now: () => now });
  t.after(async () => { await worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, worker, history, updates, directory, calls: () => calls, advance: ms => { now += ms; }, issue: () => store.job(history.id).checkpoint.contentIssue };
}

test('长文先自动重试三次，遵守退避，不暂停账号也不反复通知', async t => {
  const h = fixture(t); await h.worker.tick();
  assert.equal(h.calls(), 1); assert.equal(h.issue().attempts, 1); assert.equal(h.store.job(h.history.id).status, 'queued');
  await h.worker.tick(); assert.equal(h.calls(), 1);
  for (const delay of [60000, 300000, 1800000]) { h.advance(delay); await h.worker.tick(); }
  assert.equal(h.calls(), 4); assert.equal(h.issue().exhausted, true); assert.equal(h.issue().attempts, 3);
  assert.equal(h.store.job(h.history.id).status, 'needs_review'); assert.equal(h.store.account().status, 'ready');
  assert.equal(h.store.account().errors, 0); assert.equal(h.store.notices().filter(item => item.kind === 'attention').length, 1);
  assert.equal(h.issue().url, 'https://weibo.com/detail/' + postId);
  h.advance(3600000); await h.worker.tick(); assert.equal(h.calls(), 4, '重启扫描不能重置已耗尽的预算');
});

test('暂时缺失的全文恢复后自动入库，并清除该条重试状态', async t => {
  let ready = false;
  const h = fixture(t, post => { if (!ready) throw Object.assign(new CaptureError('content', '全文暂缺'), { postId }); return { ...post, longTextContent: '恢复后的完整正文' }; });
  await h.worker.tick(); ready = true; h.advance(60000); await h.worker.tick();
  assert.equal(h.store.posts()[0].complete, 1); assert.equal(h.store.posts()[0].text, '恢复后的完整正文');
  assert.equal(h.issue(), undefined); assert.equal(h.store.notices().filter(item => item.kind === 'attention').length, 0);
});

test('旧版长文中断自动进入重试，手动暂停和其他类型错误不被开启', async t => {
  const h = fixture(t);
  h.store.updateJob(h.history.id, { status: 'needs_review', message: '长文接口未返回全文，保留断点并暂停' });
  h.worker.recoverContentFailures(); assert.equal(h.store.job(h.history.id).status, 'queued'); assert.equal(h.issue().attempts, 1);
  h.store.updateJob(h.history.id, { status: 'paused' }); h.worker.recoverContentFailures(); assert.equal(h.store.job(h.history.id).status, 'paused');
  h.store.updateJob(h.history.id, { status: 'needs_review', message: '页面字段变化', checkpoint: { pending: [raw] } });
  h.worker.recoverContentFailures(); assert.equal(h.store.job(h.history.id).status, 'needs_review'); assert.equal(h.issue(), undefined);
});

test('跳过只保留片段和链接，不伪装全文；过期点击不能跳过另一条', async t => {
  const h = fixture(t); await h.worker.tick();
  for (const delay of [60000, 300000, 1800000]) { h.advance(delay); await h.worker.tick(); }
  const business = createBusiness(() => h.store, { weibo: { worker: h.worker, browser: {} } }, () => {});
  assert.throws(() => business.skipContent(h.history.id, '200000000001'), /变化/);
  business.skipContent(h.history.id, postId);
  assert.equal(h.store.job(h.history.id).status, 'queued'); assert.equal(h.store.job(h.history.id).checkpoint.pending.length, 0);
  assert.equal(h.store.posts()[0].complete, 0); assert.equal(h.store.posts()[0].text, '已读到的正文片段');
  assert.equal(h.store.targetProgress()[0].history.incompleteCount, 1); assert.equal(h.store.job(h.updates.id).status, 'paused');
  assert.throws(() => business.skipContent(h.history.id, postId), /变化/);
});

test('微博长文缺失携带具体微博ID，认证验证错误不被误认为正文重试', async t => {
  const h = fixture(t), browser = new WeiboBrowser(h.directory, async () => {});
  browser.request = async () => ({});
  await assert.rejects(browser.complete(raw), error => error.kind === 'content' && error.postId === postId);
  browser.request = async () => { throw new CaptureError('verification', '需要页面验证'); };
  await assert.rejects(browser.complete(raw), error => error.kind === 'verification');
});

test('恢复旧长文问题只清除对应提醒，不影响其他账号故障', async t => {
  const h = fixture(t), message = '长文接口未返回全文，保留断点并暂停';
  const old = h.store.notice('attention', '测试博主：' + message, Date.now(), uid);
  const other = h.store.notice('attention', '其他连接问题仍需处理', Date.now(), uid);
  h.store.updateJob(h.history.id, { status: 'needs_review', message }); h.worker.recoverContentFailures();
  assert.ok(h.store.notices().find(notice => notice.id === old).read_at);
  assert.equal(h.store.notices().find(notice => notice.id === other).read_at, null);
});

test('自动重试耗尽后再次恢复全文，会消除同一条故障的未读提醒', async t => {
  let ready = false;
  const h = fixture(t, post => { if (!ready) throw Object.assign(new CaptureError('content', '全文暂缺'), { postId }); return { ...post, longTextContent: '恢复后的全文' }; });
  await h.worker.tick(); for (const delay of [60000, 300000, 1800000]) { h.advance(delay); await h.worker.tick(); }
  assert.equal(h.store.unreadNotices().attention, 1);
  ready = true; h.store.updateJob(h.history.id, { status: 'queued', next_run_at: 0 }); await h.worker.tick();
  assert.equal(h.store.unreadNotices().attention, 0); assert.equal(h.issue(), undefined);
});
