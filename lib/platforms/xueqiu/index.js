// Independently implemented. Uses the user's browser session, without App identity rotation.
import { chromium, request as apiRequest } from 'playwright';
import { join } from 'node:path';
import { CaptureError } from '../../capture-error.js';
import { plainText } from '../../text.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { xueqiuAvatar, xueqiuImages } from './media.js';

export const defaults = { requestGapMs: 30000, historyGapMs: 120000, intervalMs: 900000 };

function networkError() { return new CaptureError('network', '雪球网络或授权窗口中断，断点已保留'); }

const hosts = new Set(['xueqiu.com', 'www.xueqiu.com']);

export function sessionOrigin(session) {
  const value = session?.origin || session?.storageState?.origins?.find(item => ['https://www.xueqiu.com', 'https://xueqiu.com'].includes(item.origin))?.origin || 'https://www.xueqiu.com';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hosts.has(url.hostname) && !url.port && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {}
  throw new CaptureError('login', '雪球授权来源无效，请主动重新登录');
}

export function parseAuthor(input) {
  const value = String(input || '').trim();
  if (/^\d{5,20}$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('请输入雪球数字 UID 或博主主页链接'); }
  if (!hosts.has(url.hostname) || !['https:', 'http:'].includes(url.protocol)) throw new Error('只支持雪球主页链接');
  const match = url.pathname.match(/^\/(?:u\/)?(\d{5,20})\/?$/);
  if (!match) throw new Error('请使用雪球博主主页，不要填写帖子链接');
  return match[1];
}

export function decodeResponse({ status, body, retryAfter = 0, redirected = false }) {
  if (status === 429) throw new CaptureError('limited', '雪球限制访问频率，正在冷却', retryAfter);
  if ([403, 418, 432, 461, 567].includes(status)) throw new CaptureError('verification', `雪球返回 ${status}，请在独立浏览器中处理验证`);
  if (status === 401 || redirected) throw new CaptureError('login', '雪球登录可能已失效，请确认连接');
  if (status >= 500) throw new CaptureError('network', '雪球服务暂时异常');
  if (status !== 200) throw new CaptureError('schema', `雪球返回未识别的 HTTP ${status}，保留断点并暂停`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CaptureError('verification', '雪球返回网页或异常内容，请检查登录与验证');
  const code = String(body.error_code ?? body.result_code ?? '0');
  if (['10022', '400016'].includes(code)) throw new CaptureError('login', '雪球登录已失效，请重新确认连接');
  if (['110017'].includes(code)) throw new CaptureError('verification', '雪球限制了当前访问，请在浏览器中检查');
  const message = [body.error_description, body.msg, body.message, typeof body.error === 'string' ? body.error : ''].filter(Boolean).join(' ');
  if (/请.*登录|重新登录|login required|not logged in|token.*(?:expired|失效)/i.test(message)) throw new CaptureError('login', '雪球要求重新登录');
  if (/too many requests|rate.?limit|请求频率|请求过于频繁|访问频繁/i.test(message)) throw new CaptureError('limited', '雪球限制访问频率，正在冷却', retryAfter);
  if (/验证|captcha|verify|访问受限|安全校验/i.test(message)) throw new CaptureError('verification', '雪球要求验证或限制了访问');
  if (!['0', ''].includes(code)) throw new CaptureError('schema', `雪球返回业务错误 ${code}，不将其记为空动态`);
  return body;
}

function isArticle(raw) { return String(raw?.type) === '3' && !!raw.title?.trim(); }

function articleReference(raw) {
  return { id: raw.id, user_id: raw.user_id ?? raw.user?.id, user: raw.user, created_at: raw.created_at, type: raw.type, title: raw.title, truncated: false };
}

function content(raw) {
  if (isArticle(raw)) return { text: plainText(raw.title) + '\n\n文章链接：https://xueqiu.com/' + (raw.user_id ?? raw.user?.id) + '/' + raw.id, complete: true };
  const body = plainText(raw.text || raw.description || '');
  const title = plainText(raw.title || '');
  const text = [title, body || (xueqiuImages(raw).length ? '分享图片' : '')].filter(Boolean).join('\n\n');
  return { text, complete: raw.truncated === false && !!raw.text?.trim() };
}

export function normalizePost(raw, uid) {
  const id = raw.id;
  if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^\d+$/.test(String(id))) {
    throw new CaptureError('schema', '雪球帖子 ID 无法无损解析，已暂停');
  }
  if (String(raw.user_id ?? raw.user?.id) !== uid) return null;
  const publishedAt = typeof raw.created_at === 'number' ? raw.created_at : Number(raw.created_at);
  if (!Number.isFinite(publishedAt) || publishedAt <= 0) throw new CaptureError('schema', '雪球发布时间格式变化，已暂停');
  const main = content(raw);
  if (!main.text) throw new CaptureError('schema', '雪球正文为空，保留断点并暂停');
  const quoted = raw.retweeted_status;
  const quote = quoted ? { id: String(quoted.id || ''), author: quoted.user?.screen_name || '',
    text: content(quoted).text || '原文当前不可访问', complete: content(quoted).complete,
    ...(isArticle(quoted) ? { article: true, url: `https://xueqiu.com/${quoted.user_id ?? quoted.user?.id}/${quoted.id}` } : {}) } : null;
  return { id: String(id), uid, author: raw.user?.screen_name || uid, publishedAt, text: main.text,
    url: `https://xueqiu.com/${uid}/${id}`, complete: main.complete && (!quote || quote.complete), quote, avatar: xueqiuAvatar(raw.user), images: isArticle(raw) ? [] : xueqiuImages(raw), article: isArticle(raw),
    raw: isArticle(raw) ? articleReference(raw) : quoted && isArticle(quoted) ? { ...raw, retweeted_status: articleReference(quoted) } : raw };
}

export class XueqiuBrowser {
  constructor(directory, beforeRequest, expectedUid = () => null) {
    this.id = 'xueqiu'; this.name = '雪球';
    this.directory = directory; this.beforeRequest = beforeRequest; this.expectedUid = expectedUid;
    this.context = null; this.page = null; this.opening = null;
    this.http = null; this.sessionData = null; this.sessionFile = join(directory, 'xueqiu-session.json');
    this.defaults = defaults;
  }
  parseAuthor(input) { return parseAuthor(input); }
  normalizePost(raw, uid) { return normalizePost(raw, uid); }
  isPinned(raw) { return Number(raw.mark) === 1; }

  async open() {
    if (this.context && this.page && !this.page.isClosed()) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (!this.context) {
        this.context = await chromium.launchPersistentContext(join(this.directory, 'xueqiu-browser'), {
          channel: 'chrome', headless: false, viewport: null,
        });
        this.context.on('close', () => { this.context = null; this.page = null; });
      }
      this.page = this.context.pages()[0] || await this.context.newPage();
      await this.page.goto('https://www.xueqiu.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    })();
    try { await this.opening; } finally { this.opening = null; }
  }

  async login() {
    try {
      await this.open();
      if (this.http) { await this.http.dispose(); this.http = null; }
      this.sessionData = null;
      if (existsSync(this.sessionFile)) unlinkSync(this.sessionFile);
      await this.page.bringToFront();
    } catch (error) { if (error.kind) throw error; throw networkError(); }
  }

  persistSession(session) {
    if (JSON.stringify(session) !== JSON.stringify(this.sessionData)) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(this.sessionFile + '.tmp', JSON.stringify(session), { mode: 0o600 });
      renameSync(this.sessionFile + '.tmp', this.sessionFile);
    }
    this.sessionData = session;
  }

  async captureSession() {
    if (!this.context || !this.page || this.page.isClosed()) throw new CaptureError('login', '请主动登录雪球，并保持窗口打开，完成后确认连接');
    const storageState = await this.context.storageState();
    const cookies = storageState.cookies.filter(cookie => /(^|\.)xueqiu\.com$/.test(cookie.domain.replace(/^\./, '')));
    const uid = cookies.find(cookie => cookie.name === 'u')?.value;
    if (!/^[1-9]\d{4,19}$/.test(uid || '') || !cookies.some(cookie => cookie.name === 'xq_a_token' && cookie.value)) throw new CaptureError('login', '雪球尚未取得完整会话，请完成登录或验证');
    if (this.expectedUid() && this.expectedUid() !== uid) throw new CaptureError('login', '雪球账号与资料库绑定账号不一致');
    const origin = sessionOrigin({ origin: new URL(this.page.url()).origin });
    this.persistSession({ uid, origin, userAgent: await this.page.evaluate(() => navigator.userAgent), storageState });
    if (this.http) { await this.http.dispose(); this.http = null; }
    return uid;
  }

  validateSession() {
    const cookies = this.sessionData?.storageState?.cookies;
    const valid = name => (Array.isArray(cookies) ? cookies : []).find(cookie => cookie?.name === name
      && hosts.has(String(cookie.domain).replace(/^\./, '')) && cookie.value
      && (cookie.expires == null || cookie.expires <= 0 || cookie.expires > Date.now() / 1000));
    if (!valid('xq_a_token') || valid('u')?.value !== this.sessionData?.uid) throw new CaptureError('login', '雪球授权已过期或账号不一致，请主动重新登录');
  }

  async httpSession() {
    if (this.http) { this.validateSession(); return this.http; }
    if (!this.sessionData && existsSync(this.sessionFile)) {
      try { this.sessionData = JSON.parse(readFileSync(this.sessionFile, 'utf8')); }
      catch { throw new CaptureError('login', '雪球本地授权不可读，请主动重新登录'); }
    }
    if (!this.sessionData?.storageState || !/^[1-9]\d{4,19}$/.test(this.sessionData.uid || '')) throw new CaptureError('login', '雪球授权缺失，请主动点击登录；不会自动打开浏览器');
    if (this.expectedUid() && this.expectedUid() !== this.sessionData.uid) throw new CaptureError('login', '雪球账号与资料库绑定账号不一致');
    this.validateSession();
    this.http = await apiRequest.newContext({ storageState: this.sessionData.storageState, userAgent: this.sessionData.userAgent,
      timeout: 30000, extraHTTPHeaders: { Referer: sessionOrigin(this.sessionData) + '/', 'X-Requested-With': 'XMLHttpRequest' } });
    return this.http;
  }

  async checkLogin() {
    try {
      if (this.context) await this.captureSession();
      await this.httpSession();
      const uid = this.sessionData.uid;
      const data = await this.request('/v4/statuses/user_timeline.json?user_id=' + encodeURIComponent(uid) + '&page=1&count=1', { verifying: true });
      if (!Array.isArray(data.statuses) || Number(data.page) !== 1) throw new CaptureError('schema', '雪球接口未确认授权，连接未启用');
      if (this.context) await this.context.close();
      return uid;
    } catch (error) { if (error.kind) throw error; throw networkError(); }
  }

  async request(path, options = {}) {
    await this.beforeRequest({ ...options, interactiveProfile: false });
    let response;
    try {
      if (this.expectedUid() && this.sessionData?.uid && this.expectedUid() !== this.sessionData.uid) throw new CaptureError('login', '雪球账号与资料库绑定账号不一致');
      const http = await this.httpSession();
      response = await http.get(sessionOrigin(this.sessionData) + path, { maxRedirects: 0 });
      let body; try { body = await response.json(); } catch { body = null; }
      const retry = response.headers()['retry-after'];
      const result = decodeResponse({ status: response.status(), body, redirected: response.status() >= 300 && response.status() < 400,
        retryAfter: /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0 });
      this.persistSession({ ...this.sessionData, storageState: await this.http.storageState() });
      return result;
    } catch (error) { if (error.kind) throw error; throw networkError(); }
    finally { if (response) await response.dispose(); }
  }

  async profile(uid, options) {
    const data = await this.request('/v4/statuses/user_timeline.json?user_id=' + encodeURIComponent(uid) + '&page=1&count=1', options);
    const user = data.user || data.statuses?.map(status => status.user).find(user => String(user?.id) === uid);
    if (!user || String(user.id) !== uid || !user.screen_name?.trim()) throw new CaptureError('schema', '雪球暂未返回博主资料；空时间线不能被当作有效昵称');
    const count = Number(data.total ?? user.statuses_count ?? user.status_count);
    return { name: user.screen_name, avatar: xueqiuAvatar(user), total: Number.isSafeInteger(count) && count >= 0 ? count : null };
  }

  needsRequest(raw) {
    return !content(raw).complete || !!raw.retweeted_status && !content(raw.retweeted_status).complete;
  }

  async timeline(uid, page) {
    const data = await this.request(`/v4/statuses/user_timeline.json?user_id=${encodeURIComponent(uid)}&page=${page}&count=20`);
    if (!Array.isArray(data.statuses) || data.page !== page || !Number.isInteger(data.maxPage) || data.maxPage < 0) {
      throw new CaptureError('schema', '雪球时间线或分页字段变化，已暂停');
    }
    const end = data.maxPage > 0 ? page >= data.maxPage : data.total === 0 && data.statuses.length === 0;
    return { items: data.statuses, end, total: data.total,
      endMessage: end ? '已到雪球当前返回的可访问末尾，不代表完整历史' : '' };
  }

  async complete(raw) {
    const post = structuredClone(raw);
    for (const item of [post, post.retweeted_status].filter(Boolean)) {
      if (!content(item).complete) {
        const detail = await this.request('/statuses/show.json?id=' + encodeURIComponent(item.id));
        if (String(detail.id) !== String(item.id) || !content(detail).complete) {
          throw new CaptureError('schema', '雪球详情没有确认完整正文，保留断点并暂停');
        }
        Object.assign(item, detail);
        break;
      }
    }
    return post;
  }

  async close() {
    if (this.opening) await this.opening.catch(() => {});
    if (this.http) { await this.http.dispose(); this.http = null; }
    if (this.context) await this.context.close();
  }
}
