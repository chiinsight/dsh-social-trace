import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRuntime } from '../lib/index.js';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { CaptureError } from '../lib/capture-error.js';
import { decodeResponse as weiboResponse } from '../lib/platforms/weibo/index.js';
import { decodeResponse as snowResponse } from '../lib/platforms/xueqiu/index.js';

for (const status of [461, 567]) test(`微博 HTTP ${status} 停止等待验证，不能走普通网络重试`, () => {
  assert.throws(() => weiboResponse({ status }), e => e.kind === 'verification');
});
for (const decode of [weiboResponse, snowResponse]) test(`${decode === weiboResponse ? '微博' : '雪球'} JSON 安全校验及频率提示停止或退避，不当成字段变化`, () => {
  assert.throws(() => decode({ status: 200, body: { error_description: '请完成安全验证' } }), e => e.kind === 'verification');
  assert.throws(() => decode({ status: 200, body: { error_description: 'Too many requests' } }), e => e.kind === 'limited');
});

for (const platform of ['weibo', 'xueqiu']) test(`${platform} 手动检查连接遇到429持久化冷却，立刻重按不发网络请求`, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-risk-'));
  const runtime = createRuntime(directory);
  const server = createServer(runtime.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const source = runtime.sources[platform]; let calls = 0;
  runtime.store.setAccount({ status: 'ready', uid: '8000000000' }, platform);
  source.browser.checkLogin = async () => { await source.worker.beforeRequest({ verifying: true }); calls++; throw new CaptureError('limited', '平台限制访问频率', 180000); };
  const verify = () => fetch(`http://127.0.0.1:${server.address().port}/dsh-social-trace/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify({ platform }) });
  const start = Date.now(); await verify();
  const account = runtime.store.account(platform);
  assert.ok(account.cooldown_until >= start + 180000);
  assert.equal(account.errors, 1);
  assert.equal((await verify()).status, 429);
  assert.equal(calls, 1);
  assert.equal(runtime.store.account(platform === 'weibo' ? 'xueqiu' : 'weibo').cooldown_until, 0);
});

test('本地页完成不清除网络失败计数，也不缩短服务端冷却期限', t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-risk-local-'));
  const store = new Store(directory); let now = Date.now();
  store.addTarget('1234567890', '测试作者', now);
  store.setAccount({ status: 'ready' });
  const worker = new Worker(store, { id: 'weibo' }, { now: () => now });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const history = store.jobs().find(j => j.kind === 'history');
  worker.fail(history, new CaptureError('network', '网络失败'));
  const until = store.account().cooldown_until;
  now = until;
  worker.finishPage(history, { page: 1, lastScanAt: now, end: true }, store.target(history.uid));
  assert.equal(store.account().errors, 1);
  worker.fail(store.job(history.id), new CaptureError('limited', '限流', 600000));
  assert.equal(store.account().errors, 2);
  assert.ok(store.account().cooldown_until >= now + 600000);
});


test('手动资料读取连续三次网络失败后暂停，不覆盖原有暂停或另一平台状态', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-risk-profile-'));
  const runtime = createRuntime(directory);
  const server = createServer(runtime.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  runtime.store.addTarget('1234567890', '测试作者');
  runtime.store.setAccount({ status: 'ready' });
  let clock = Date.now(), calls = 0;
  runtime.worker.now = () => clock;
  runtime.browser.profile = async (_, options) => { await runtime.worker.beforeRequest(options); calls++; throw new CaptureError('network', '网络超时'); };
  const refresh = () => fetch(`http://127.0.0.1:${server.address().port}/dsh-social-trace/targets/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify({ uid: '1234567890', interactive: true }) });
  for (let i = 1; i <= 3; i++) {
    await refresh();
    assert.equal(runtime.store.account().errors, i);
    assert.ok(runtime.store.account().cooldown_until > clock);
    assert.equal((await refresh()).status, 429);
    assert.equal(calls, i);
    clock = runtime.store.account().cooldown_until;
  }
  assert.equal(runtime.store.account().status, 'paused');
  assert.match(runtime.store.account().reason, /连续三次/);
  assert.equal(runtime.store.account('xueqiu').errors, 0);
  runtime.worker.requestSucceeded();
  assert.equal(runtime.store.account().status, 'paused');
  assert.equal(runtime.store.account().errors, 3);
});
