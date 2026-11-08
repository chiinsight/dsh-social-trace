import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createUpdates } from '../lib/update.js';
import { createRuntime } from '../lib/index.js';

const { version: currentVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fixture({ version = '0.2.0', spec = '^0.1.0', manager, fetchImpl } = {}) {
  const calls = [];
  const host = manager || { installBundle: async value => { calls.push(value); return { application: 'restart-required' }; } };
  const updates = createUpdates({ getService: key => key === 'pluginManager' ? host : key === 'profileContext' ? { name: 'desktop', dir: '.' } : null,
    readFile: async () => JSON.stringify({ dependencies: { 'dsh-social-trace': spec } }),
    fetchImpl: fetchImpl || (async () => new Response(JSON.stringify({ version }))) });
  return { updates, calls };
}

test('检查更新不安装，缓存最新版本且只允许用户选择刚检查到的新版', async () => {
  const { updates, calls } = fixture();
  assert.throws(() => updates.start('0.2.0'), /先检查/);
  const view = await updates.check();
  assert.equal(view.currentVersion, currentVersion); assert.equal(view.latestVersion, '0.2.0');
  assert.equal(view.updateAvailable, true); assert.equal(view.canApply, true);
  assert.equal('installSpec' in view, false);
  assert.deepEqual(calls, []);
  assert.throws(() => updates.start('0.3.0'), /版本已变化/);
  updates.start('0.2.0');
  assert.throws(() => updates.start('0.2.0'), /正在进行/);
  const done = await updates.settled();
  assert.equal(done.phase, 'restart-required');
  assert.deepEqual(calls, ['dsh-social-trace@0.2.0']);
});

test('未发布、网络错误、同版和更旧版本不误报更新', async () => {
  for (const fetchImpl of [async () => new Response('{}', { status: 404 }), async () => { throw new Error('offline'); }]) {
    const { updates, calls } = fixture({ fetchImpl });
    assert.equal((await updates.check()).checkFailed, true);
    assert.throws(() => updates.start('0.2.0'), /先检查/);
    assert.equal(calls.length, 0);
  }
  for (const version of ['0.1.0', '0.0.9', 'invalid']) {
    const { updates } = fixture({ version });
    assert.equal((await updates.check()).updateAvailable, false);
    assert.throws(() => updates.start(version));
  }
});

test('本地源码安装保留开发链接，不自动替换成 npm 包', async () => {
  for (const spec of ['link:../plugin', 'file:../plugin', 'workspace:*']) {
    const { updates, calls } = fixture({ spec });
    const view = await updates.check();
    assert.equal(view.updateAvailable, true); assert.equal(view.canApply, false);
    assert.throws(() => updates.start('0.2.0'), /本地源码/);
    assert.equal(calls.length, 0);
  }
});

test('宿主报告覆盖配置时不误报新版已生效', async () => {
  const { updates } = fixture({ manager: { installBundle: async () => ({ application: 'overridden' }) } });
  await updates.check(); updates.start('0.2.0');
  assert.equal((await updates.settled()).phase, 'overridden');
});

test('宿主缺少安装服务时保留检查与手动命令', async () => {
  const updates = createUpdates({ fetchImpl: async () => new Response('{"version":"0.2.0"}') });
  const view = await updates.check();
  assert.equal(view.canApply, false);
  assert.match(view.manualCommand, /dsh-social-trace@latest/);
  assert.throws(() => updates.start('0.2.0'), /未提供一键更新/);
});

test('移除后安装抛错会尝试恢复原版，不向界面泄露底层诊断', async () => {
  const calls = [];
  const { updates } = fixture({ manager: {
    installBundle: async value => {
      calls.push(value);
      if (calls.length === 1) return { error: { code: 'already-installed' } };
      if (value.endsWith('@0.2.0')) throw new Error('sensitive diagnostic sample');
      return { application: 'applied' };
    },
    removeBundle: async () => ({ application: 'applied' }),
  } });
  await updates.check(); updates.start('0.2.0');
  const result = await updates.settled();
  assert.equal(result.phase, 'failed');
  assert.equal(calls.at(-1), 'dsh-social-trace@' + currentVersion);
  assert.doesNotMatch(JSON.stringify(result), /sensitive diagnostic sample/);
});

test('更新 HTTP 操作校验来源并先返回进度；等待当前采集后安装，恢复原开关', async t => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const { updates, calls } = fixture();
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-update-'));
  const runtime = createRuntime(directory, { updates });
  const server = createServer(runtime.handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/dsh-social-trace';
  t.after(async () => { release(); await updates.settled(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const headers = { 'Content-Type': 'application/json', 'X-Social-Trace': '1' };
  assert.equal((await fetch(base + '/update', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/update', { method: 'POST', headers: { ...headers, Origin: 'https://example.invalid' }, body: '{}' })).status, 403);
  assert.equal((await (await fetch(base + '/update')).json()).update.updateAvailable, true);
  runtime.store.setSetting('monitorEnabled', false);
  runtime.worker.busy = barrier;
  const response = await fetch(base + '/update', { method: 'POST', headers, body: JSON.stringify({ version: '0.2.0' }) });
  assert.equal(response.status, 202);
  assert.equal(runtime.worker.suspended, true); assert.equal(calls.length, 0);
  assert.equal((await fetch(base + '/monitoring', { method: 'POST', headers, body: JSON.stringify({ scope: 'all', enabled: true }) })).status, 409);
  release(); runtime.worker.busy = null;
  await updates.settled();
  assert.equal((await (await fetch(base + '/update/state')).json()).update.phase, 'restart-required');
  assert.equal(runtime.store.getSetting('monitorEnabled'), false);
  assert.equal(runtime.worker.suspended, false);
});
