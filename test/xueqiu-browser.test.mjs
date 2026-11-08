import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, request } from 'playwright';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { XueqiuBrowser, sessionOrigin, normalizePost } from '../lib/platforms/xueqiu/index.js';
import { xueqiuAvatar, xueqiuImages, xueqiuImage } from '../lib/platforms/xueqiu/media.js';

function setup(t, status = 200) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-snow-http-'));
  const launches = [], requests = [], disposed = [], gates = [];
  const state = { cookies: [{ name: 'u', value: '8000000000', domain: '.xueqiu.com' }, { name: 'xq_a_token', value: 'mock-session', domain: '.xueqiu.com' }], origins: [{ origin: 'https://www.xueqiu.com', localStorage: [] }] };
  t.mock.method(chromium, 'launchPersistentContext', async (path, options) => {
    const events = new Map();
    const page = { isClosed: () => false, url: () => 'https://www.xueqiu.com/', goto: async () => {}, bringToFront: async () => {}, evaluate: async () => 'Authorized browser' };
    const context = { on: (event, callback) => events.set(event, callback), pages: () => [page], storageState: async () => state, close: async () => events.get('close')?.() };
    launches.push({ path, options }); return context;
  });
  t.mock.method(request, 'newContext', async options => ({ get: async (url, args) => {
    requests.push({ url, args, options });
    return { status: () => status, headers: () => ({}), json: async () => ({ statuses: [], page: 1, maxPage: 0, total: 0 }), dispose: async () => disposed.push(url) };
  }, storageState: async () => state, dispose: async () => {} }));
  const browser = new XueqiuBrowser(directory, async options => gates.push(options));
  t.after(async () => { await browser.close(); rmSync(directory, { recursive: true, force: true }); });
  return { browser, launches, requests, disposed, gates, state };
}

test('雪球授权来源严格限定官网，不混用 www 会话或跟随重定向', () => {
  assert.equal(sessionOrigin({ storageState: { origins: [{ origin: 'https://www.xueqiu.com' }] } }), 'https://www.xueqiu.com');
  assert.equal(sessionOrigin({ origin: 'https://xueqiu.com' }), 'https://xueqiu.com');
  for (const origin of ['http://www.xueqiu.com', 'https://xueqiu.com.evil.test', 'https://xueqiu.com:444', 'https://u@xueqiu.com', 'https://xueqiu.com/?a=1']) assert.throws(() => sessionOrigin({ origin }), error => error.kind === 'login');
});

test('雪球后台与检查连接不启动浏览器；只有主动授权开窗，确认后 HTTP 继续且释放响应', async t => {
  const h = setup(t);
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  await assert.rejects(h.browser.timeline('1102105103', 1), error => error.kind === 'login');
  assert.equal(h.launches.length, 0);
  await h.browser.login();
  assert.equal(h.launches[0].path, join(h.browser.directory, 'xueqiu-browser'));
  assert.equal(h.launches[0].options.headless, false);
  assert.equal(h.launches[0].options.ignoreDefaultArgs, undefined);
  assert.equal(await h.browser.checkLogin(), '8000000000');
  assert.equal(h.browser.context, null);
  await h.browser.timeline('1102105103', 1);
  assert.equal(h.launches.length, 1);
  assert.equal(h.requests.length, 2);
  assert.equal(h.disposed.length, 2);
  assert.ok(h.requests.every(r => r.url.startsWith('https://www.xueqiu.com/') && r.options.extraHTTPHeaders.Referer === 'https://www.xueqiu.com/' && r.args.maxRedirects === 0));
  assert.ok(h.gates.every(gate => gate.interactiveProfile === false));
  assert.equal(statSync(h.browser.sessionFile).mode & 0o777, 0o600);
});

for (const status of [401, 429, 567]) test(`雪球 ${status} 不绕过限制或自动开窗重试`, async t => {
  const h = setup(t, status);
  h.browser.persistSession({ uid: '8000000000', storageState: h.state });
  await assert.rejects(h.browser.timeline('1102105103', 1), error => error.kind === ({401:'login',429:'limited',567:'verification'})[status]);
  assert.equal(h.launches.length, 0); assert.equal(h.requests.length, 1); assert.equal(h.disposed.length, 1);
});

test('雪球授权损坏或绑定账号不符，不删除凭证或借用其他浏览器', async t => {
  const h = setup(t);
  writeFileSync(h.browser.sessionFile, '{broken', { mode: 0o600 });
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  assert.equal(statSync(h.browser.sessionFile).size, 7);
  h.browser.persistSession({ uid: '8000000000', storageState: h.state });
  h.browser.expectedUid = () => '7000000000';
  await assert.rejects(h.browser.checkLogin(), error => error.kind === 'login');
  assert.equal(h.requests.length, 0); assert.equal(h.launches.length, 0);
});

test('雪球图片和头像只接受独立 CDN，纯图片可留存，长文摘要不能标为全文', async () => {
  for (const value of ['http://localhost/a', 'https://imedao.com.evil.test/a', 'https://u@xqimg.imedao.com/a', 'file:///tmp/a', 'https://wx1.sinaimg.cn/a']) assert.equal(xueqiuImage(value), null);
  assert.equal(xueqiuAvatar({ photo_domain: '//xqimg.imedao.com/', profile_image_url: 'a!50x50.png,a!180x180.png' }), 'https://xqimg.imedao.com/a!180x180.png');
  assert.deepEqual(xueqiuImages({ image_info_list: [{ filename: 'image.png' }], text: '<img src="https://xqimg.imedao.com/image.png">' }), ['https://xqimg.imedao.com/image.png']);
  const raw = { id: 123, user_id: 12345, created_at: 1000, text: '<img src="https://xqimg.imedao.com/image.png">', truncated: false };
  assert.equal(normalizePost(raw, '12345').text, '分享图片');
  assert.equal(normalizePost(raw, '12345').complete, true);
  const adapter = new XueqiuBrowser('/unused', async () => {});
  adapter.request = async () => ({ ...raw, text: '', description: '摘要...', truncated: false });
  await assert.rejects(adapter.complete({ ...raw, text: '', truncated: true }), error => error.kind === 'schema');
});


test('雪球文章与转发文章只保存标题和链接，不请求详情、不保留摘要或正文', async t => {
  const h = setup(t);
  const article = { id: 123, user_id: 12345, user: { id: 12345 }, created_at: 1000, type: '3', title: '文章标题', text: '不应备份的正文', description: '不应备份的摘要', longTextForIOS: '正文', truncated: true };
  assert.equal(h.browser.needsRequest(article), false);
  const post = normalizePost(await h.browser.complete(article), '12345');
  assert.equal(post.article, true);
  assert.equal(post.text, '文章标题\n\n文章链接：https://xueqiu.com/12345/123');
  assert.equal(post.complete, true);
  assert.doesNotMatch(JSON.stringify(post.raw), /不应备份|longTextForIOS/);
  const repost = { id: 124, user_id: 12345, created_at: 2000, text: '我的评论', truncated: false, retweeted_status: article };
  assert.equal(h.browser.needsRequest(repost), false);
  const quoted = normalizePost(await h.browser.complete(repost), '12345');
  assert.equal(quoted.text, '我的评论');
  assert.match(quoted.quote.text, /文章链接/);
  assert.doesNotMatch(JSON.stringify(quoted.raw), /不应备份|longTextForIOS/);
  assert.equal(h.requests.length, 0);
});


test('雪球 Cookie 过期或 u 与绑定账号不符，不把公共时间线可读误报为授权有效', async t => {
  const h = setup(t);
  h.state.cookies[1].expires = Date.now() / 1000 - 10;
  h.browser.persistSession({ uid: '8000000000', storageState: h.state });
  await assert.rejects(h.browser.checkLogin(), e => e.kind === 'login');
  assert.equal(h.requests.length, 0);
  h.state.cookies[1].expires = -1;
  h.state.cookies[0].value = '7000000000';
  await assert.rejects(h.browser.checkLogin(), e => e.kind === 'login');
  assert.equal(h.requests.length, 0);
  assert.equal(h.launches.length, 0);
});
