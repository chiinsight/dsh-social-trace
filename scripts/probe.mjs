import { chromium } from 'playwright';
import { join } from 'node:path';
import { dataDirectory } from '../lib/paths.js';
const targetUid = process.env.SOCIAL_TRACE_PROBE_UID;
if (!targetUid || !/^\d{5,20}$/.test(targetUid)) throw new Error('请设置 SOCIAL_TRACE_PROBE_UID（5–20 位数字 UID）');

const context = await chromium.launchPersistentContext(join(dataDirectory(), 'weibo-browser'), {
  channel: 'chrome', headless: false, viewport: { width: 1200, height: 850 },
});
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const urls = [
    `/ajax/statuses/mymblog?uid=${targetUid}&page=1&feature=0`,
  ];
  console.log(JSON.stringify({ title: await page.title(), host: new URL(page.url()).hostname,
    cookieDomains: [...new Set((await context.cookies()).map(cookie => cookie.domain))] }));
  console.log(JSON.stringify(await page.evaluate(() => ({
    hasConfigUid: !!window.$CONFIG?.uid,
    configLoggedIn: window.$CONFIG?.islogin,
  }))));
  for (const url of urls) {
    if (url !== urls[0]) await new Promise(resolve => setTimeout(resolve, 15000));
    const response = await page.evaluate(async path => {
      const res = await fetch(path, { credentials: 'include', signal: AbortSignal.timeout(30000) });
      let json;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    }, url);
    const data = response.json;
    const list = data?.data?.list;
    console.log(JSON.stringify({
      endpoint: url.split('?')[0], status: response.status, isJson: !!data,
      ok: data?.ok, login: data?.data?.login, hasUid: !!data?.data?.uid,
      count: Array.isArray(list) ? list.length : undefined,
      longPosts: Array.isArray(list) ? list.filter(post => post.isLongText).length : undefined,
      hasCursor: !!data?.data?.since_id,
      topLevelKeys: data ? Object.keys(data) : [],
      dataKeys: data?.data ? Object.keys(data.data) : [],
      bottomVisible: data?.data?.bottom_tips_visible,
      bottomTips: data?.data?.bottom_tips_text,
      postKeys: Array.isArray(list) && list.length ? Object.keys(list[0]) : [],
      error: typeof data?.error === 'string' ? data.error.slice(0, 200) : undefined,
    }));
    if ([401, 403, 418, 429, 432].includes(response.status) || !data) break;
    if (Array.isArray(list)) {
      const long = list.find(post => post.isLongText);
      if (long) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        const result = await page.evaluate(async id => {
          const res = await fetch('/ajax/statuses/longtext?id=' + encodeURIComponent(id), { credentials: 'include' });
          const body = await res.json();
          return { endpoint: '/ajax/statuses/longtext', status: res.status, ok: body.ok,
            hasFullText: !!body.data?.longTextContent, dataKeys: Object.keys(body.data || {}) };
        }, long.idstr || String(long.id));
        console.log(JSON.stringify(result));
        if (result.status !== 200 || result.ok !== 1) break;
      }
      await new Promise(resolve => setTimeout(resolve, 15000));
      const next = await page.evaluate(async uid => {
        const res = await fetch('/ajax/statuses/mymblog?uid=' + uid + '&page=2&feature=0', { credentials: 'include' });
        const body = await res.json();
        return { endpoint: '/ajax/statuses/mymblog?page=2', status: res.status, ok: body.ok,
          count: body.data?.list?.length, firstId: body.data?.list?.[0]?.idstr,
          visibilityKeys: Object.keys(body.data?.status_visible || {}),
          bottomVisible: body.data?.bottom_tips_visible,
          bottomTips: body.data?.bottom_tips_text, total: body.data?.total };
      }, targetUid);
      console.log(JSON.stringify({ ...next, firstId: next.firstId ? 'present' : 'absent' }));
    }
  }
} finally {
  await context.close();
}
