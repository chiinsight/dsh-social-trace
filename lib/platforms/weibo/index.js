import { chromium, request as apiRequest } from 'playwright';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { plainText, weiboAvatar, weiboImages } from '../../text.js';
export { plainText } from '../../text.js';
import { join } from 'node:path';
import { CaptureError } from '../../capture-error.js';

export function parseAuthor(input) {
  const value = String(input || '').trim();
  if (/^\d{5,20}$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('请输入微博数字 UID 或包含数字 UID 的主页链接'); }
  if (!['weibo.com', 'www.weibo.com', 'm.weibo.cn', 'weibo.cn'].includes(url.hostname)
      || !['http:', 'https:'].includes(url.protocol)) throw new Error('只支持微博主页链接');
  const match = url.pathname.match(/^\/(?:u\/|profile\/)?(\d{5,20})\/?$/);
  if (!match) throw new Error('暂不支持自定义昵称链接，请使用含数字 UID 的主页链接');
  return match[1];
}

export function normalizePost(raw, uid) {
  const id = raw.idstr || raw.id;
  if ((!raw.idstr && typeof id === 'number' && !Number.isSafeInteger(id)) || !/^\d+$/.test(String(id))) {
    throw new CaptureError('schema', '帖子 ID 无法无损解析，已暂停');
  }
  if (String(raw.user?.idstr || raw.user?.id) !== uid) return null;
  const publishedAt = Date.parse(raw.created_at);
  if (!Number.isFinite(publishedAt)) throw new CaptureError('schema', '发布时间格式变化，已暂停');
  const text = plainText(raw.longTextContent || raw.text_raw || raw.text);
  if (!text) throw new CaptureError('schema', '正文为空，已暂停以防漏存');
  let quote = null;
  if (raw.retweeted_status) {
    const quoted = raw.retweeted_status;
    quote = { id: String(quoted.idstr || quoted.id || ''), author: quoted.user?.screen_name || '',
      text: plainText(quoted.longTextContent || quoted.text_raw || quoted.text || '原文当前不可访问'),
      images: weiboImages(quoted), complete: !quoted.isLongText || !!quoted.longTextContent };
  }
  return { id: String(id), uid, avatar: weiboAvatar(raw.user), images: weiboImages(raw), author: raw.user?.screen_name || uid, publishedAt, text,
    url: `https://weibo.com/${uid}/${raw.mblogid || raw.bid || id}`,
    complete: (!raw.isLongText || !!raw.longTextContent) && (!quote || quote.complete), quote, raw };
}

export function decodeResponse({ status, body, retryAfter, redirected }) {
  if (status === 429) throw new CaptureError('limited', '平台限制访问频率，正在冷却', retryAfter);
  if ([403, 418, 432, 461, 567].includes(status)) throw new CaptureError('verification', `平台返回 ${status}，请在浏览器中检查验证提示`);
  if (status === 401 || redirected) throw new CaptureError('login', '登录已失效，请重新登录');
  if (status >= 500) throw new CaptureError('network', '微博服务暂时异常');
  if (status !== 200) throw new CaptureError('schema', `收到未识别的 HTTP ${status}，已暂停`);
  if (!body || typeof body !== 'object') throw new CaptureError('verification', '接口返回了网页，可能需要登录或验证');
  const message = [body.msg, body.message, body.error_description, typeof body.error === 'string' ? body.error : ''].filter(Boolean).join(' ');
  if (/登录|login|passport/i.test(message)) throw new CaptureError('login', '平台要求重新登录');
  if (/too many requests|rate.?limit|请求频率|请求过于频繁/i.test(message)) throw new CaptureError('limited', '微博限制访问频率，正在冷却', retryAfter);
  if (/验证|频繁|异常|captcha|verify|访问受限/i.test(message)) throw new CaptureError('verification', '平台要求验证或限制了访问');
  if (body.ok !== 1 || !body.data || typeof body.data !== 'object') {
    throw new CaptureError('schema', '接口未返回成功数据，已暂停；不会将失败记为没有更新');
  }
  return body.data;
}

function browserError(error) {
  const message = String(error?.message || '');
  return new CaptureError('network', /closed|destroyed|disconnected/i.test(message) ? '微博采集页面已关闭或正在跳转，请重新打开登录窗口并确认连接'
    : /timeout|timed out|net::/i.test(message) ? '微博网页或接口连接超时，稍后自动重试，已保存内容不受影响'
    : /executable|browser.*not found/i.test(message) ? '找不到采集所需的 Chrome 浏览器，请检查 Chrome 是否已安装'
    : '微博接口连接失败，稍后自动重试；若持续失败，请检查网络或微博连接');
}

export class WeiboBrowser {
  constructor(directory, beforeRequest, expectedUid = () => null) {
    this.id = 'weibo';
    this.name = '微博';
    this.directory = directory;
    this.beforeRequest = beforeRequest;
    this.expectedUid = expectedUid;
    this.context = null;
    this.opening = null;
    this.page = null;
    this.headless = true;
    this.http = null;
    this.sessionData = null;
    this.sessionFile = join(directory, 'weibo-session.json');
  }

  parseAuthor(input) { return parseAuthor(input); }
  normalizePost(raw, uid) { return normalizePost(raw, uid); }
  isPinned(raw) { return !!(raw.isTop || raw.is_top || raw.top); }

  async open({ interactive = false } = {}) {
    if (this.opening) await this.opening;
    if (interactive && this.context && this.headless) await this.close();
    if (this.context) {
      if (this.page && !this.page.isClosed() && this.page.url() !== 'about:blank') return;
      this.page = this.context.pages().find(page => !page.isClosed()) || await this.context.newPage();
      await this.page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      return;
    }
    this.opening = (async () => {
      this.headless = !interactive;
      this.context = await chromium.launchPersistentContext(join(this.directory, 'weibo-browser'), {
        channel: 'chrome', headless: this.headless, viewport: null,
      });
      const context = this.context;
      context.on('close', () => { if (this.context === context) { this.context = null; this.page = null; } });
      this.page = this.context.pages()[0] || await this.context.newPage();
      await this.page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    })();
    try { await this.opening; } finally { this.opening = null; }
  }

  async login() {
    try {
      await this.open({ interactive: true });
      if (this.http) { await this.http.dispose(); this.http = null; }
      this.sessionData = null;
      if (existsSync(this.sessionFile)) unlinkSync(this.sessionFile);
      await this.page.bringToFront();
    }
    catch (error) { if (error.kind) throw error; throw browserError(error); }
  }

  persistSession(session) {
    const serialized = JSON.stringify(session);
    if (serialized !== JSON.stringify(this.sessionData)) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(this.sessionFile + '.tmp', serialized, { mode: 0o600 });
      renameSync(this.sessionFile + '.tmp', this.sessionFile);
    }
    this.sessionData = session;
  }

  async captureSession() {
    if (!this.context || !this.page || this.page.isClosed()) throw new CaptureError('login', '请主动点击登录微博，并保持登录窗口打开，完成后点击确认连接');
    const identity = await this.page.evaluate(() => ({ uid: String(window.$CONFIG?.uid || ''),
      loggedIn: String(window.$CONFIG?.islogin || ''), userAgent: navigator.userAgent }));
    if (!/^[1-9]\d{4,19}$/.test(identity.uid) || ['0', 'false'].includes(identity.loggedIn)) throw new CaptureError('login', '微博尚未确认登录，请主动打开登录窗口完成授权');
    this.persistSession({ uid: identity.uid, userAgent: identity.userAgent, storageState: await this.context.storageState() });
    if (this.http) { await this.http.dispose(); this.http = null; }
    return identity.uid;
  }

  async httpSession() {
    if (this.http) {
      if (this.expectedUid() && this.expectedUid() !== this.sessionData.uid) throw new CaptureError('login', '登录账号发生变化，请切回此档案库绑定的账号');
      return this.http;
    }
    if (!this.sessionData && existsSync(this.sessionFile)) {
      try { this.sessionData = JSON.parse(readFileSync(this.sessionFile, 'utf8')); }
      catch { throw new CaptureError('login', '本地微博授权不可读，请重新登录'); }
    }
    if (!this.sessionData?.storageState || !this.sessionData.uid) throw new CaptureError('login', '本地微博授权缺失，请点击登录微博；检查连接不会自动打开浏览器');
    if (this.expectedUid() && this.expectedUid() !== this.sessionData.uid) throw new CaptureError('login', '登录账号发生变化，请切回此档案库绑定的账号');
    this.http = await apiRequest.newContext({ storageState: this.sessionData.storageState, userAgent: this.sessionData.userAgent,
      timeout: 30000, extraHTTPHeaders: { Referer: 'https://weibo.com/', 'X-Requested-With': 'XMLHttpRequest' } });
    return this.http;
  }

  async request(path, options) {
    await this.beforeRequest(options);
    let response;
    try {
      const context = await this.httpSession();
      response = await context.get('https://weibo.com' + path, { maxRedirects: 0,
        ...(options?.monitoringHead ? { timeout: 10000, headers: { 'Cache-Control': 'no-cache' } } : {}) });
      let body;
      try { body = await response.json(); } catch { body = null; }
      const retry = response.headers()['retry-after'];
      const retryAfter = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0;
      const result = decodeResponse({ status: response.status(), body, retryAfter, redirected: response.status() >= 300 && response.status() < 400 });
      this.persistSession({ ...this.sessionData, storageState: await context.storageState() });
      return result;
    } catch (error) {
      if (error.kind) throw error;
      throw browserError(error);
    } finally { if (response) await response.dispose(); }
  }

  async checkLogin() {
    try {
      if (this.context) await this.captureSession();
      await this.httpSession();
      const uid = this.sessionData.uid;
      const data = await this.request('/ajax/profile/info?uid=' + encodeURIComponent(uid), { verifying: true });
      if (String(data.user?.idstr || data.user?.id) !== uid) throw new CaptureError('login', '微博接口未确认授权，请重新登录');
      if (this.context) await this.context.close();
      return uid;
    } catch (error) {
      if (this.headless && this.context) await this.context.close().catch(() => {});
      if (error.kind) throw error;
      throw browserError(error);
    }
  }

  async profile(uid, options) {
    const data = await this.request('/ajax/profile/info?uid=' + encodeURIComponent(uid), options);
    const user = data.user;
    if (String(user?.idstr || user?.id) !== uid || typeof user?.screen_name !== 'string' || !user.screen_name.trim()) {
      throw new CaptureError('schema', '微博未返回匹配的博主资料，请检查主页或登录状态');
    }
    return { name: user.screen_name.trim(), avatar: weiboAvatar(user), total: user.statuses_count != null && user.statuses_count !== '' && Number.isSafeInteger(Number(user.statuses_count)) && Number(user.statuses_count) >= 0 ? Number(user.statuses_count) : null };
  }

  async timeline(uid, page, cursor, options) {
    const data = await this.request(`/ajax/statuses/mymblog?uid=${uid}&page=${page}&feature=0`
      + (cursor ? '&since_id=' + encodeURIComponent(cursor) : ''), options);
    if (!Array.isArray(data.list)) throw new CaptureError('schema', '时间线字段变化，已暂停');
    // An explicit end marker is needed: an empty page alone cannot prove completion.
    return { items: data.list, end: data.bottom_tips_visible === true || data.bottom_tips_visible === 1,
      endMessage: plainText(data.bottom_tips_text || ''), total: data.total,
      nextCursor: typeof data.since_id === 'string' ? data.since_id : null };
  }

  needsRequest(raw) { return [raw, raw.retweeted_status].filter(Boolean).some(post => post.isLongText && !post.longTextContent); }

  async complete(raw) {
    const post = structuredClone(raw);
    for (const item of [post, post.retweeted_status].filter(Boolean)) {
      if (item.isLongText && !item.longTextContent) {
        const data = await this.request('/ajax/statuses/longtext?id=' + encodeURIComponent(item.idstr || item.id));
        if (typeof data.longTextContent !== 'string' || !data.longTextContent.trim()) {
          throw Object.assign(new CaptureError('content', '微博暂时没有返回这条内容的全文'), { postId: String(item.idstr || item.id) });
        }
        item.longTextContent = data.longTextContent;
        break;
      }
    }
    return post;
  }

  async close() {
    if (this.opening) await this.opening.catch(() => {}); // Browser startup errors are reported by the caller.
    if (this.context) await this.context.close();
    if (this.http) { await this.http.dispose(); this.http = null; }
  }
}
