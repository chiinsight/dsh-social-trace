import { chromium } from 'playwright';
import { join } from 'node:path';
import { dataDirectory } from '../lib/paths.js';

const context = await chromium.launchPersistentContext(join(dataDirectory(), 'weibo-browser'), {
  channel: 'chrome', headless: false, viewport: null,
});
const page = context.pages()[0] || await context.newPage();
await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded' });
console.log('微博登录窗口已打开。登录状态只保存在本机独立浏览器目录。请在窗口内完成登录，完成后关闭此窗口。');
await new Promise(resolve => context.on('close', resolve));
