import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { CaptureError } from '../lib/capture-error.js';
function fixture(t, check = async () => '8000000000') {
  const directory = mkdtempSync(join(tmpdir(), 'trace-recovery-')), store = new Store(directory);
  let now = Date.now(), calls = 0;
  store.setAccount({ uid: '8000000000', status: 'ready' });
  store.addTarget('1234567890', '测试博主', now, 'weibo', { archiveHistory: false, captureMode: 'from_now' });
  const adapter = { id: 'weibo', checkLogin: async () => { calls++; return check(); } };
  const worker = new Worker(store, adapter, { now: () => now });
  t.after(async () => { await worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, worker, calls: () => calls, advance: () => { now = Math.max(worker.recovery()?.nextAt || 0, store.account().cooldown_until, store.account().next_request_at) + 1; } };
}
const failNetwork = worker => { for (let n = 0; n < 3; n++) worker.failAccount(new CaptureError('network', '网络暂时失败')); };

test('网络连续失败后自动用授权检查恢复，不开启浏览器，不改变历史暂停', async t => {
  const h = fixture(t); failNetwork(h.worker);
  assert.equal(h.store.account().status, 'paused'); await h.worker.tick(); assert.equal(h.calls(), 0);
  h.advance(); await h.worker.tick(); assert.equal(h.calls(), 1);
  assert.equal(h.store.account().status, 'ready'); assert.equal(h.worker.recovery(), null);
  assert.equal(h.store.jobs().find(job => job.kind === 'history').status, 'paused');
});
test('自动恢复失败遵守服务端冷却，不在每次 tick 反复请求', async t => {
  const h = fixture(t, async () => { throw new CaptureError('limited', '请求限流', 900000); });
  failNetwork(h.worker); h.advance(); const before = h.store.account().cooldown_until; await h.worker.tick();
  assert.equal(h.calls(), 1); assert.ok(h.worker.recovery().nextAt >= before + 900000);
  for (let i = 0; i < 10; i++) await h.worker.tick(); assert.equal(h.calls(), 1);
});
test('登录提示先自动确认一次，真正失效后停止并等待用户授权', async t => {
  const h = fixture(t, async () => { throw new CaptureError('login', '授权已失效'); });
  h.worker.failAccount(new CaptureError('login', '请登录')); h.advance(); await h.worker.tick();
  assert.equal(h.calls(), 1); assert.equal(h.worker.recovery(), null); assert.equal(h.store.account().status, 'needs_login');
  h.advance(); await h.worker.tick(); assert.equal(h.calls(), 1);
});
test('验证码不自动重试，全局关闭及手动暂停也不自动开启', async t => {
  const h = fixture(t); h.worker.failAccount(new CaptureError('verification', '需要验证码'));
  await h.worker.tick(); assert.equal(h.calls(), 0);
  h.store.setAccount({ status: 'ready' }); failNetwork(h.worker); h.advance();
  h.store.setSetting('monitorEnabled', false); await h.worker.tick(); assert.equal(h.calls(), 0);
  h.store.setSetting('monitorEnabled', true); h.store.setSetting('connectionRecovery:weibo', null); h.store.setAccount({ status: 'paused', reason: '已手动暂停微博采集' });
  await h.worker.tick(); assert.equal(h.calls(), 0);
});
test('自动确认过程中用户暂停，返回结果不能重新开启', async t => {
  let done; const gate = new Promise(resolve => { done = resolve; }); const h = fixture(t, () => gate);
  failNetwork(h.worker); h.advance(); const work = h.worker.tick();
  h.store.setSetting('connectionRecovery:weibo', null); h.store.setAccount({ status: 'paused', reason: '已手动暂停微博采集' });
  done('8000000000'); await work; assert.equal(h.store.account().status, 'paused');
});
test('自动检查拒绝切换绑定账号，旧版自动网络暂停可恢复', async t => {
  const h = fixture(t, async () => '9000000000');
  h.store.setAccount({ status: 'paused', errors: 3, reason: '网络失败；连续三次异常，账号任务已暂停' });
  await h.worker.tick(); assert.equal(h.calls(), 1); assert.equal(h.store.account().uid, '8000000000');
  assert.equal(h.store.account().status, 'needs_login'); assert.equal(h.worker.recovery(), null);
});

test('手动暂停后读取资料失败也不能排入自动恢复', async t => {
  const h = fixture(t); h.store.setAccount({ status: 'paused', reason: '已手动暂停微博采集' });
  failNetwork(h.worker); h.advance(); await h.worker.tick();
  assert.equal(h.calls(), 0); assert.equal(h.worker.recovery(), null);
  assert.equal(h.store.account().reason, '已手动暂停微博采集');
});

test('所有博主任务都关闭时，不额外发连接检查请求', async t => {
  const h = fixture(t); failNetwork(h.worker); h.advance();
  for (const job of h.store.jobs()) h.store.updateJob(job.id, { status: 'paused' });
  await h.worker.tick(); assert.equal(h.calls(), 0);
});
