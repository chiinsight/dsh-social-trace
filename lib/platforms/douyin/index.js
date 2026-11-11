import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { CaptureError } from '../../capture-error.js';
import { parseAuthor, normalizePost, decodeList, avatar } from './data.js';
import { defaults } from './config.js';

export { parseAuthor, normalizePost, defaults };
export function parseResponse(text) {
  return JSON.parse(text, (key, value, context) => {
    if (['aweme_id', 'uid', 'max_cursor'].includes(key) && typeof value === 'number') {
      if (context?.source && /^\d+$/.test(context.source)) return context.source;
      if (!Number.isSafeInteger(value)) throw new CaptureError('schema', '抖音ID无法无损解析');
      return String(value);
    }
    return value;
  });
}

export class DouyinBrowser {
  constructor(directory, beforeRequest, expectedUid = () => null) {
    this.id = 'douyin'; this.name = '抖音'; this.defaults = defaults;
    this.directory = directory; this.beforeRequest = beforeRequest; this.expectedUid = expectedUid;
    this.sessionFile = join(directory, 'douyin-session.json');
    this.context = null; this.browser = null; this.backgroundContext = null; this.page = null; this.idle = null; this.closed = false;
    this.sessionData = null; this.activeUid = ''; this.responses = []; this.profileData = null;
  }
  parseAuthor(input) { return parseAuthor(input); }
  normalizePost(raw, uid) { return normalizePost(raw, uid); }
  isPinned(raw) { return raw.is_top === 1 || raw.is_top === true || raw.is_top === '1'; }
  needsRequest() { return false; }
  async complete(raw) { return raw; }

  loadSession() {
    if (!this.sessionData && existsSync(this.sessionFile)) {
      try { this.sessionData = JSON.parse(readFileSync(this.sessionFile, 'utf8')); }
      catch { throw new CaptureError('login', '抖音授权文件不可读，请重新登录'); }
    }
    const cookies = this.sessionData?.storageState?.cookies || [];
    if (!cookies.some(cookie => /(^|\.)douyin\.com$/.test(cookie.domain) && ['sessionid', 'sessionid_ss'].includes(cookie.name) && cookie.value && (cookie.expires <= 0 || cookie.expires > Date.now() / 1000))) throw new CaptureError('login', '抖音本地授权缺失或过期，请主动登录；不会自动弹出窗口');
    if (this.expectedUid() && this.expectedUid() !== this.sessionData.uid) throw new CaptureError('login', '抖音授权与资料库绑定账号不一致');
    return this.sessionData;
  }
  async login() {
    await this.release(); this.closed = false;
    this.context = await chromium.launchPersistentContext(join(this.directory, 'douyin-browser'), { channel: 'chrome', headless: false, viewport: null });
    this.context.on('close', () => { this.context = null; });
    const page = this.context.pages()[0] || await this.context.newPage();
    await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  async checkLogin() {
    if (this.context) {
      const storageState = await this.context.storageState();
      const identity = storageState.cookies.find(cookie => /(^|\.)douyin\.com$/.test(cookie.domain) && cookie.name === 'uid_tt');
      if (!identity?.value) throw new CaptureError('login', '尚未确认抖音登录，请在授权窗口完成登录后再继续');
      const uid = createHash('sha256').update(identity.value).digest('hex');
      if (this.expectedUid() && this.expectedUid() !== uid) throw new CaptureError('login', '抖音账号与资料库绑定账号不同');
      const previous = this.sessionData;
      this.sessionData = { uid, storageState };
      try { this.loadSession(); } catch (error) { this.sessionData = previous; throw error; }
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(this.sessionFile + '.tmp', JSON.stringify(this.sessionData), { mode: 0o600 });
      renameSync(this.sessionFile + '.tmp', this.sessionFile);
      await this.context.close(); this.context = null;
    }
    // Only local session validity is checked here. Actual access is confirmed by the next list response.
    return this.loadSession().uid;
  }
  async release() {
    clearTimeout(this.idle); this.idle = null;
    const browser = this.browser; this.browser = null; this.backgroundContext = null; this.page = null; this.activeUid = ''; this.responses = [];
    if (browser) await browser.close();
  }
  armIdle() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { void this.release().catch(() => {}); }, 180000); this.idle.unref();
  }
  async finishScan() { this.armIdle(); }
  async openAuthor(uid) {
    clearTimeout(this.idle);
    const session = this.loadSession();
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
      this.backgroundContext = await this.browser.newContext({ storageState: session.storageState, viewport: { width: 1100, height: 800 } });
    }
    if (this.page) await this.page.close();
    this.page = await this.backgroundContext.newPage(); this.activeUid = uid; this.profileData = null; this.responses = [];
    const owner = this.page;
    this.page.on('response', async response => {
      try {
        const url = new URL(response.url());
        if (!['www.douyin.com', 'www-hj.douyin.com', 'douyin.com'].includes(url.hostname)) return;
        if (url.pathname.includes('/aweme/post/') && url.searchParams.get('sec_user_id') === uid) {
          const status = response.status();
          const entry = { cursor: url.searchParams.get('max_cursor') || '0' };
          if ([401, 403, 429].includes(status)) entry.error = new CaptureError(status === 429 ? 'limited' : 'verification', '抖音限制了访问，请在独立授权窗口检查');
          else if (status !== 200) entry.error = new CaptureError('network', '抖音作品请求未成功');
          else { try { entry.data = parseResponse(await response.text()); } catch { entry.error = new CaptureError('schema', '抖音未返回可解析的作品数据'); } }
          if (this.activeUid === uid && this.page === owner) this.responses.push(entry);
        } else if (url.pathname.includes('/user/profile/other/') && url.searchParams.get('sec_user_id') === uid) {
          const body = parseResponse(await response.text());
          if (body.user?.sec_uid === uid && this.page === owner) this.profileData = body.user;
        }
      } catch { /* Ignore unrelated resource responses. */ }
    });
    await this.page.goto('https://www.douyin.com/user/' + uid, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  async pageResult(uid, cursor, options) {
    this.closed = false;
    await this.beforeRequest(options);
    const requested = String(cursor ?? '0');
    try {
      if (!this.page || this.activeUid !== uid || requested === '0') await this.openAuthor(uid);
      const deadline = Date.now() + 30000;
      let scrollAt = 0, progressed = false;
      while (Date.now() < deadline && !this.closed) {
        const index = this.responses.findIndex(item => item.cursor === requested);
        if (index >= 0) {
          const [entry] = this.responses.splice(index, 1);
          if (entry.error) throw entry.error;
          const result = decodeList(entry.data);
          if (!result.items.length && !result.end) throw new CaptureError('schema', '抖音返回不明空页，保留断点，不当成没有更新');
          if (!result.end && String(result.nextCursor) === requested) throw new CaptureError('schema', '抖音分页未前进，已停止并保留断点');
          const refreshed = await this.backgroundContext.storageState?.();
          if (refreshed) {
            this.sessionData = { ...this.sessionData, storageState: refreshed };
            writeFileSync(this.sessionFile + '.tmp', JSON.stringify(this.sessionData), { mode: 0o600 });
            renameSync(this.sessionFile + '.tmp', this.sessionFile);
          }
          this.armIdle(); return result;
        }
        if (requested !== '0' && this.responses.length) {
          for (const entry of this.responses.splice(0)) {
            if (entry.error) throw entry.error;
            if (decodeList(entry.data).end) throw new CaptureError('schema', '历史分页位置已失效，请重新选择历史范围');
            progressed = true;
          }
        }
        if (requested !== '0' && Date.now() >= scrollAt) {
          await this.page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); window.dispatchEvent(new Event('scroll')); });
          await this.page.mouse.wheel(0, 2000); scrollAt = Date.now() + defaults.requestGapMs;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (progressed && requested !== '0') { this.armIdle(); throw new CaptureError('wait', '正在恢复抖音历史分页位置，已保留作品断点', defaults.requestGapMs); }
      throw new CaptureError('network', '抖音作品列表加载超时，已保留进度，将自动重试，无需重新登录');
    } catch (error) {
      if (error.kind !== 'wait') await this.release();
      if (error.kind) throw error;
      throw new CaptureError('network', '抖音读取中断，进度已保留');
    }
  }
  async profile(uid, options) {
    const result = await this.pageResult(uid, '0', options);
    const user = this.profileData || result.items.find(item => item.author?.sec_uid === uid)?.author;
    if (!user?.nickname) throw new CaptureError('schema', '抖音未返回可确认的博主昵称，请稍后重试');
    const total = Number(user.aweme_count);
    return { name: user.nickname, avatar: avatar(user), total: Number.isSafeInteger(total) && total >= 0 ? total : null };
  }
  timeline(uid, page, cursor, options) { return this.pageResult(uid, page === 1 ? '0' : cursor, options); }
  async close() { this.closed = true; if (this.context) await this.context.close(); this.context = null; await this.release(); }
}
