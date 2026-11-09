import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, request } from 'playwright';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WeiboBrowser } from '../lib/platforms/weibo/index.js';

function setup(t, { status = 200 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-http-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const launches = [], requests = [], disposed = [];
  const state = { cookies: [], origins: [] };
  t.mock.method(chromium, 'launchPersistentContext', async (directory, options) => {
    const events = new Map();
    const page = { isClosed: () => false, url: () => 'https://weibo.com/', goto: async () => {}, bringToFront: async () => {},
      evaluate: async () => ({ uid: '8000000000', loggedIn: '1', userAgent: 'Authorized browser' }) };
    const context = { on: (event, callback) => events.set(event, callback), pages: () => [page], storageState: async () => state, close: async () => events.get('close')?.() };
    launches.push({ directory, options, context }); return context;
  });
  t.mock.method(request, 'newContext', async options => ({
    get: async (url, requestOptions) => {
      requests.push({ url, options, requestOptions });
      return { status: () => status, headers: () => ({}), json: async () => ({ ok: 1, data: { user: { idstr: '8000000000' }, list: [] } }), dispose: async () => disposed.push(url) };
    }, storageState: async () => state, dispose: async () => {},
  }));
  const browser = new WeiboBrowser(directory, async () => {});
  t.after(() => browser.close());
  return { directory, browser, launches, requests, disposed, state };
}

test('已有授权时连续 HTTP 监控不启动浏览器，响应及时释放，授权文件仅本人可读', async t => {
  const h = setup(t);
  h.browser.persistSession({ uid: '8000000000', userAgent: 'Authorized browser', storageState: h.state });
  await h.browser.request('/ajax/test'); await h.browser.request('/ajax/test');
  assert.equal(h.launches.length, 0); assert.equal(h.requests.length, 2); assert.equal(h.disposed.length, 2);
  assert.equal(h.requests[0].requestOptions.maxRedirects, 0);
  assert.equal(statSync(h.browser.sessionFile).mode & 0o777, 0o600);
  await h.browser.close();
  await h.browser.request('/ajax/test');
  assert.equal(h.launches.length, 0);
});

test('授权缺失时重复采集和检查连接均不启动 Chrome，只有主动登录才开窗', async t => {
  const h = setup(t);
  await assert.rejects(h.browser.request('/ajax/test'), error => error.kind === 'login');
  await assert.rejects(h.browser.request('/ajax/test'), error => error.kind === 'login');
  assert.equal(h.launches.length, 0);
  assert.equal(h.requests.length, 0);
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  assert.equal(h.launches.length, 0);
  await h.browser.login();
  assert.equal(await h.browser.checkLogin(), '8000000000');
  assert.equal(h.launches.length, 1);
  assert.equal(h.launches[0].directory, join(h.directory, 'weibo-browser'));
  assert.equal(h.browser.context, null);
  await h.browser.request('/ajax/test');
  assert.equal(h.launches.length, 1);
});

test('最新页重验证缓存且限制等待时间，历史请求保持原策略', async t => {
  const h = setup(t);
  h.browser.persistSession({ uid: '8000000000', storageState: h.state });
  await h.browser.timeline('1234567890', 1, null, { monitoringHead: true });
  await h.browser.timeline('1234567890', 2);
  assert.equal(h.requests[0].requestOptions.timeout, 10000);
  assert.equal(h.requests[0].requestOptions.headers['Cache-Control'], 'no-cache');
  assert.equal(h.requests[1].requestOptions.timeout, undefined);
  assert.equal(h.launches.length, 0);
});

test('损坏的授权文件只报告连接错误，不启动浏览器或删除已有文件', async t => {
  const h = setup(t);
  writeFileSync(h.browser.sessionFile, '{broken', { mode: 0o600 });
  await assert.rejects(h.browser.request('/ajax/test'), error => error.kind === 'login');
  assert.equal(h.launches.length, 0);
  assert.equal(statSync(h.browser.sessionFile).size, 7);
});

test('主动登录才显示窗口，确认真实 API 可用后关闭授权窗口并继续 HTTP 监控', async t => {
  const h = setup(t);
  await h.browser.login(); assert.equal(h.launches[0].options.headless, false);
  assert.equal(h.launches[0].directory, join(h.directory, 'weibo-browser'), '仅使用插件自己的浏览器目录');
  assert.equal(h.launches[0].options.ignoreDefaultArgs, undefined, '保留 Playwright 默认的模拟钥匙串与隔离启动参数');
  assert.equal(await h.browser.checkLogin(), '8000000000');
  assert.equal(h.browser.context, null);
  assert.match(h.requests[0].url, /ajax\/profile\/info/);
  await h.browser.request('/ajax/test'); assert.equal(h.launches.length, 1);
});

test('授权失效只返回登录错误，不反复启动浏览器或弹出窗口', async t => {
  const h = setup(t, { status: 401 });
  h.browser.persistSession({ uid: '8000000000', storageState: h.state });
  await assert.rejects(h.browser.request('/ajax/test'), error => error.kind === 'login');
  assert.equal(h.launches.length, 0); assert.equal(h.disposed.length, 1);
});

test('授权窗口关闭后检查不自动重开，不误用旧授权；再次主动登录才能确认', async t => {
  const h = setup(t);
  h.browser.persistSession({ uid: '7000000000', storageState: h.state });
  await h.browser.login(); await h.browser.context.close();
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  assert.equal(h.launches.length, 1);
  await h.browser.login();
  assert.equal(await h.browser.checkLogin(), '8000000000');
  assert.equal(h.browser.sessionData.uid, '8000000000');
  assert.deepEqual(h.launches.map(launch => launch.options.headless), [false, false]);
  assert.equal(h.browser.context, null);
});
