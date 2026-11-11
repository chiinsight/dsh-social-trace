import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/index.js';
import { createUpdates } from '../lib/update.js';
const offlineUpdates = () => createUpdates({ fetchImpl: async () => new Response(JSON.stringify({ version: '0.1.0' })) });
import { CaptureError } from '../lib/capture-error.js';
import { parseAuthor, normalizePost } from '../lib/platforms/weibo/index.js';
import { normalizePost as normalizeDouyinPost } from '../lib/platforms/douyin/data.js';
import { XueqiuBrowser } from '../lib/platforms/xueqiu/index.js';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const assets = {
  '/react.js': readFileSync(new URL('./umd/react.development.js', 'file://' + require.resolve('react'))),
  '/react-dom.js': readFileSync(new URL('./umd/react-dom.development.js', 'file://' + require.resolve('react-dom'))),
  '/client.js': readFileSync(new URL('../lib/client.js', import.meta.url)),
};
// The host mounts the actual plugin slot; platform fixtures exercise presentation only.
const shell = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#root{height:100vh}</style><style id="dsh-social-trace-style">.st{background:#eee}</style></head><body><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
window.__ModuleLoader__={load(reg){reg.factory(()=>React).apply({slots:{inject:(slot,gen)=>gen().next(),register:(spec,comp)=>{if(spec.name==='main')ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(comp));return()=>{};}}});}};
</script><script src="/client.js"></script></body></html>`;

test('插件流向图：多平台汇总、折叠连线、博主档案联动与真实状态动效', async t => {
  const groups = [
    ['weibo', [['示例博主甲', 1280], ['示例博主乙', 864], ['示例博主丙', 572]]],
    ['x', [['Orbit Notes', 648], ['Mira Builds', 431], ['Evan AI', 309]]],
    ['bilibili', [['示例博主丁', 276], ['示例博主戊', 194]]],
    ['rednote', [['示例博主己', 386], ['示例博主庚', 218]]],
  ];
  const targets = groups.flatMap(([platform, authors], group) => authors.map(([name], index) => ({ uid: String(1000 + group * 10 + index), name, platform })));
  const counts = groups.flatMap(([, authors]) => authors.map(([, count]) => count));
  const state = {
    platforms: groups.map(([id]) => ({ id, name: id, requestGapMs: 15000, targetDefaults: { historyGapMs: 60000, intervalMs: 900000 } })),
    targets, count: 5178, todayNewCount: 12, account: { status: 'paused', cooldown_until: 0, reason: '测试暂停' },
    archiveSummary: targets.map((item, i) => ({ uid: item.uid, count: counts[i], last_saved_at: 1000 })),
    jobs: [], notices: [{ id: 'n1', uid: '1011', kind: 'update', message: 'Mira 更新了', created_at: 1000 }, { id: 'n2', uid: '1000', kind: 'attention', message: '连接需要处理', created_at: 1001 }, { id: 'n3', kind: 'task', message: '任务进度', created_at: 1002 }], unreadContent: { total: 1, authors: [{ uid: '1011', count: 1 }] }, activeJobId: null, stopped: false, requestGapMs: 15000,
    targetDefaults: { historyGapMs: 60000, intervalMs: 900000 },
    storage: { workspaceDirectory: '/tmp/Social Trace default', documentsDirectory: '/tmp/Social Trace default/documents', changing: false, syncing: false, error: '' },
  };
  state.progress = [{ uid: '1011', saved: 431, lastSavedAt: 1000, lastCheckedAt: null, nextCheckAt: null, history: { status: 'paused', started: false, pages: 0, oldestAt: null, reportedTotal: 1000, estimatedRemaining: 569 } }];
  state.update = { currentVersion: '0.1.0', latestVersion: '0.2.0', updateAvailable: true, checkedAt: new Date().toISOString(), canApply: true, phase: 'idle', manualCommand: 'dsh plugin --profile desktop add dsh-social-trace@latest' };
  state.agent = { transportAvailable: true, config: { enabled: true, botId: 'demo-bot', targetId: 'demo-target', uids: [] }, deliveries: [{ id: 'demo-delivery', author: '示例博主甲', status: 'sent', created_at: Date.now() }] };
  state.platforms[0].schedule = { enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1 }] };
  state.platforms[0].frequency = { intervalMs: 60000, nextChangeAt: Date.now() + 3600000, nextIntervalMs: 3600000 };
  let postFixture = [];
  let requestedPosts = '';
  let emptyStatus = false;
  const writes = [];
  const server = createServer(async (req, res) => {
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url.startsWith('/dsh-social-trace/media?')) { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64')); }
    if (req.url.startsWith('/dsh-social-trace/avatar?')) { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64')); }
    if (req.url === '/dsh-social-trace/assets/xueqiu.png') { res.setHeader('Content-Type', 'image/png'); return res.end(readFileSync(new URL('../assets/xueqiu.png', import.meta.url))); }
    if (req.url === '/dsh-social-trace/assets/weibo.ico') { res.setHeader('Content-Type', 'image/x-icon'); return res.end(readFileSync(new URL('../assets/weibo.ico', import.meta.url))); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      writes.push({ path: req.url, body: parsed });
      if (req.url === '/dsh-social-trace/update') { state.update = { ...state.update, phase: 'restart-required', result: { updatedVersion: parsed.version, restartRequired: true } }; res.statusCode = 202; return res.end(JSON.stringify({ update: state.update })); }
      if (req.url === '/dsh-social-trace/agent/settings') state.agent.config = parsed;
      if (req.url.endsWith('/monitoring')) {
        if (parsed.scope === 'all') state.enabled = parsed.enabled;
        if (parsed.scope === 'platform') state.platforms?.find(item => item.id === parsed.platform) && (state.platforms.find(item => item.id === parsed.platform).enabled = parsed.enabled);
        if (parsed.scope === 'target') state.targets.find(item => item.uid === parsed.uid).enabled = parsed.enabled;
      }
      if (req.url.endsWith('/targets')) {
        state.targets.push({ uid: '9000000000', external_uid: '9000000000', name: '9000000000', capture_mode: 'pending', platform: parsed.platform });
        state.jobs.push({ id: 'new-target', uid: '9000000000', kind: 'updates', status: 'paused', next_run_at: 0, saved: 0, pages: 0 });
        state.jobs.push({ id: 'new-history', uid: '9000000000', kind: 'history', status: parsed.archiveHistory ? 'queued' : 'paused', next_run_at: 0, saved: 0, pages: 0 });
      }
      if (req.url.endsWith('/targets/profile')) {
        const target = state.targets.find(item => item.uid === parsed.uid);
        target.profile_checked_at = Date.now(); target.profile_total = 2345;
      }
      if (req.url.endsWith('/targets/start')) {
        const target = state.targets.find(item => item.uid === parsed.uid);
        target.capture_mode = parsed.mode;
        state.jobs.filter(job => job.uid === parsed.uid).forEach(job => job.status = job.kind === 'updates' || parsed.mode === 'history' ? 'queued' : 'paused');
      }
      if (req.url.endsWith('/notices/read')) {
        state.notices.forEach(item => { if ((!parsed.id || parsed.id === item.id) && (!parsed.uid || parsed.uid === item.uid) && (!parsed.kind || parsed.kind === item.kind)) item.read_at = Date.now(); });
        const updates = state.notices.filter(item => item.kind === 'update' && !item.read_at);
        state.unreadContent = { total: updates.length, authors: [...new Set(updates.map(item => item.uid))].map(uid => ({ uid, count: updates.filter(item => item.uid === uid).length })) };
      }
      if (req.url.includes('/jobs/')) {
        const job = state.jobs.find(job => req.url.includes('/' + job.id + '/'));
        if (job) job.status = req.url.endsWith('/pause') ? 'paused' : 'queued';
      }
      if (req.url.endsWith('/history/pause')) state.jobs.filter(job => job.kind === 'history' && (!parsed.uid || job.uid === parsed.uid)).forEach(job => job.status = 'paused');
      if (req.url.endsWith('/targets/policy')) { state.targets.find(item => item.uid === parsed.uid).policy = parsed.inherit ? null : { intervalMs: parsed.intervalMinutes * 60000, schedule: parsed.schedule }; }
      if (req.url.endsWith('/history/range')) {
        const job = state.jobs.find(job => job.uid === parsed.uid && job.kind === 'history');
        if (job) job.status = 'queued';
        const target = state.targets.find(item => item.uid === parsed.uid);
        if (target) { target.historyOriginalOnly = parsed.originalOnly; target.history_from = parsed.from ? Date.parse(parsed.from + 'T00:00:00+08:00') : null; target.history_to = parsed.to ? Date.parse(parsed.to + 'T23:59:59.999+08:00') : null; }
      }
      if (req.url.endsWith('/settings')) { const source = state.platforms?.find(source => source.id === parsed.platform); if (source) { source.schedule = parsed.schedule; if (parsed.requestGapSeconds !== undefined) source.requestGapMs = parsed.requestGapSeconds * 1000; if (parsed.applyToAll) state.targets.filter(item => item.platform === parsed.platform).forEach(item => item.policy = null); } }
      if (req.url.endsWith('/workspace/pick')) return res.end(JSON.stringify({ directory: '/tmp/Social Trace selected' }));
      if (req.url.endsWith('/workspace')) state.storage.workspaceDirectory = parsed.directory;
      return res.end('{"ok":true}');
    }
    if (req.url.startsWith('/dsh-social-trace/update')) return res.end(JSON.stringify({ update: state.update }));
    if (req.url === '/dsh-social-trace/status') { if (emptyStatus) { res.statusCode = 404; return res.end(); } return res.end(JSON.stringify(state)); }
    if (req.url === '/dsh-social-trace/agent/bots') return res.end(JSON.stringify({ available: true, items: [{ botId: 'demo-bot', channel: 'weixin' }] }));
    if (req.url.startsWith('/dsh-social-trace/agent/targets?')) return res.end(JSON.stringify({ items: [{ targetId: 'demo-target', name: '我的微信 · 日常提醒' }] }));
    if (req.url.startsWith('/dsh-social-trace/export?')) { res.setHeader('Content-Type', 'text/markdown'); return res.end('# 测试导出'); }
    if (req.url.startsWith('/dsh-social-trace/posts?')) { requestedPosts = req.url; return res.end(JSON.stringify({ items: postFixture })); }
    res.statusCode = 404; res.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  state.targets[0].avatar_url = 'https://tva1.sinaimg.cn/test-avatar.png';
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('.st-library-head').waitFor();
  assert.equal(await page.locator('.st-library').getAttribute('open'), null);
  await page.locator('.st-library-head').click();
  await page.locator('.st-author-folder').last().waitFor();
  assert.equal(await page.locator('.st-avatar-only').count(), 10);
  await page.getByRole('button', { name: '展开全部卡片', exact: true }).click();
  assert.equal(await page.locator('#dsh-social-trace-style').count(), 1);
  assert.equal(await page.locator('.st-brand small').count(), 0);
  assert.ok(await page.locator('.st-brand').evaluate(node => node.getBoundingClientRect().top - node.closest('.st').getBoundingClientRect().top >= 44), '品牌区避开宿主顶部窗口控件');
  await page.locator('[data-flow-node="author-1000"] img').waitFor();
  assert.equal(await page.locator('[data-flow-node="author-1000"] .st-flow-avatar').evaluate(node => getComputedStyle(node).borderRadius), '50%');
  assert.equal(await page.locator('.st-aside > .st-follow-menu').count(), 0);
  assert.equal(await page.locator('.st-nav .st-follow-menu').count(), 1);
  assert.doesNotMatch(await page.locator('.st-follow-menu > summary').innerText(), /\d/);
  assert.equal(await page.getByRole('button', { name: '消息中心', exact: true }).locator('.st-nav-badge').innerText(), '3');
  assert.doesNotMatch(await page.getByRole('button', { name: '消息中心', exact: true }).innerText(), /·/);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.locator('.st-aside').screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-26-navigation.png') });
  assert.equal(await page.locator('.st').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
  await page.waitForFunction(() => document.querySelector('.st-weibo-logo')?.naturalWidth > 0);
  assert.match(await page.locator('.st-weibo-logo').getAttribute('src'), /assets\/weibo.ico/);
  await page.waitForFunction(() => document.querySelector('.st-development-platform img')?.naturalWidth === 32);
  assert.match(await page.locator('.st-flow-status.blocked').innerText(), /连接待恢复/);
  assert.equal(await page.getByRole('button', { name: '恢复连接', exact: true }).count(), 1);
  assert.equal(await page.locator('.st-source-group').count(), 4);
  assert.equal(await page.locator('.st-author-folder').count(), 6);
  assert.equal(await page.locator('.st-library-pages').innerText(), '‹\n1 / 2\n›');
  assert.equal(await page.locator('.st-author-folder[open]').count(), 0);
  if (await page.locator('.st-author-folder').count() === 6 && await page.getByRole('button', { name: '下一组博主', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '下一组博主', exact: true }).click();
    assert.equal(await page.locator('.st-author-folder').count(), 4);
    await page.getByRole('button', { name: '上一组博主', exact: true }).click();
  }
  assert.equal(await page.locator('.st-source-group').first().locator(':scope > summary').isVisible(), false);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.locator('.st-library').screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-28-library-grid.png') });
  assert.equal(await page.getByRole('button', { name: '查看效果预览', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '查看监控任务', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '打开插件设置', exact: true }).count(), 0);
  const writesBeforeSnow = writes.length;
  await page.getByRole('button', { name: '连接雪球平台', exact: true }).click();
  await page.getByRole('region', { name: '雪球账号连接', exact: true }).waitFor();
  assert.equal(writes.length, writesBeforeSnow);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  assert.match(await page.locator('.st-library-head').innerText(), /5,178/);
  assert.match(await page.locator('.st-hub-jobs').innerText(), /今日新增\s*12 条/);
  assert.equal(await page.locator('.st-flow-particle').count(), 0);
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 16);
  assert.equal(await page.locator('.st-author-detail[open]').count(), 0);
  assert.equal(await page.locator('.st-author-node').first().evaluate(node => getComputedStyle(node).borderTopWidth), '1px');
  const compactHeight = await page.locator('.st-author-node').first().evaluate(node => node.offsetHeight);
  await page.getByLabel('展开或收起示例博主甲监控频率', { exact: true }).click();
  assert.ok(await page.locator('.st-author-node').first().evaluate(node => node.offsetHeight) > compactHeight);
  await page.getByRole('button', { name: '收起频率详情', exact: true }).click();
  assert.equal(await page.locator('.st-author-detail[open]').count(), 0);
  await page.getByRole('button', { name: '展开频率详情', exact: true }).click();
  assert.equal(await page.locator('.st-author-detail[open]').count(), 10);
  const frequency = page.locator('.st-author-node').first().locator('.st-frequency-note');
  assert.doesNotMatch(await frequency.innerText(), /下次最早|下次检查待安排|重试不早于/);
  const frequencyRows = await frequency.locator(':scope > span').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
  assert.equal(frequencyRows.length, 2);
  assert.ok(Math.abs(frequencyRows[0] - frequencyRows[1]) < 2, '当前频率与分时切换在同一行');
  await page.getByRole('button', { name: '放大画布', exact: true }).click();
  assert.equal(await page.getByLabel('画布缩放比例', { exact: true }).innerText(), '110%');
  await page.waitForTimeout(100);
  const alignment = await page.evaluate(() => {
    const stage = document.querySelector('.st-flow-stage'), bounds = stage.getBoundingClientRect();
    const avatar = document.querySelector('[data-flow-node="author-1000"]').getBoundingClientRect();
    const edge = document.querySelector('[data-flow-edge="1000"]');
    const point = edge.getPointAtLength(0), scale = bounds.width / stage.offsetWidth;
    return Math.abs(bounds.left + point.x * scale - avatar.right - scale);
  });
  assert.ok(alignment < 2, '缩放后连线仍对准头像');
  const region = page.getByRole('region', { name: '博主到本地文档的内容流向图', exact: true });
  const box = await region.boundingBox();
  const beforeDrag = await page.locator('.st-flow-stage').getAttribute('style');
  await page.mouse.move(box.x + box.width / 2, box.y + 150); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 5 }); await page.mouse.up();
  assert.notEqual(await page.locator('.st-flow-stage').getAttribute('style'), beforeDrag, '拖动画布可平移');
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  await page.waitForTimeout(100);
  assert.ok(await region.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1));
  const graphFits = () => region.evaluate(node => {
    const viewport = node.getBoundingClientRect(), graph = node.querySelector('.st-flow-stage').getBoundingClientRect();
    return graph.left >= viewport.left - 1 && graph.top >= viewport.top - 1 && graph.right <= viewport.right + 1 && graph.bottom <= viewport.bottom + 1;
  });
  assert.ok(await graphFits(), '适应窗口后所有节点落在可见画布内');
  const fitZoom = await page.getByLabel('画布缩放比例', { exact: true }).innerText();
  await region.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: box.x + 150, clientY: box.y + 150 });
  assert.notEqual(await page.getByLabel('画布缩放比例', { exact: true }).innerText(), fitZoom);
  await page.getByRole('button', { name: '重置视图', exact: true }).click();
  assert.equal(await page.getByLabel('画布缩放比例', { exact: true }).innerText(), '100%');
  state.targets = [...targets, ...Array.from({ length: 40 }, (_, i) => ({ uid: String(2000 + i), name: '更多博主 ' + i, platform: 'weibo' }))];
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-author-node').length === 50);
  assert.equal(await page.locator('.st-avatar-only').count(), 40);
  assert.equal(await page.locator('.st-author-folder').count(), 6, '50 位博主每组显示六位');
  assert.match(await page.locator('.st-library-pages').textContent(), /1 \/ 9/);
  const compactPositions = await page.locator('.st-avatar-only').evaluateAll(nodes => nodes.slice(0, 4).map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y }; }));
  assert.ok(new Set(compactPositions.map(point => Math.round(point.x))).size > 1, '多人头像分成多列，不再全部垂直排列');
  assert.ok(Math.max(...compactPositions.map(point => point.y)) - Math.min(...compactPositions.map(point => point.y)) < 2, '同一排头像对齐');
  assert.equal(await page.locator('.st-author-detail:not([open])').count(), 40);
  await page.getByRole('button', { name: '收起频率详情', exact: true }).click();
  assert.equal(await page.locator('.st-author-detail[open]').count(), 0);
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  await page.waitForTimeout(100);
  assert.ok(await region.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), '50 位博主可适应窗口查看全图');
  assert.ok(await graphFits(), '50 位博主全图没有被裁掉');
  await page.getByRole('button', { name: '收起全部卡片', exact: true }).click();
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  await page.waitForTimeout(100);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-21-grid.png') });
  await page.getByRole('button', { name: '展开或收起微博博主', exact: true }).click();
  assert.equal(await page.locator('.st-source-group').first().getAttribute('open'), null);
  state.targets = targets;
  await page.evaluate(() => localStorage.removeItem('dsh-social-trace:flow-folds'));
  await page.reload();
  await page.locator('.st-author-node').last().waitFor();
  await page.getByRole('button', { name: '展开全部卡片', exact: true }).click();
  await page.getByRole('button', { name: '展开频率详情', exact: true }).click();
  assert.equal(await page.locator('.st-flow-label').count(), 0);
  assert.doesNotMatch(await page.locator('.st-flow-top').innerText(), /实时内容拓扑|博主 →/);
  assert.equal(await page.locator('.st-flow-recent').count(), 0);
  const master = page.getByRole('switch', { name: '总控制器监控开关' });
  await master.click();
  await page.waitForFunction(() => document.querySelector('[aria-label="总控制器监控开关"]')?.getAttribute('aria-checked') === 'false');
  assert.equal(writes.at(-1).body.scope, 'all');
  await master.click();
  await page.waitForFunction(() => document.querySelector('[aria-label="总控制器监控开关"]')?.getAttribute('aria-checked') === 'true');
  assert.equal(await page.getByRole('switch', { name: '示例博主甲监控开关', exact: true }).count(), 0);
  if (process.env.SOCIAL_TRACE_UI_SCREENSHOT) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: process.env.SOCIAL_TRACE_UI_SCREENSHOT, fullPage: true });
  }

  assert.equal(await page.locator('.st-nav-toggle,.st-nav-close').count(), 0);
  assert.equal(await page.getByRole('button', { name: '返回博主列表', exact: true }).count(), 0);
  assert.match(await page.locator('[data-flow-node="platform-weibo"]').locator('..').locator('.st-frequency-note').innerText(), /每 1 分钟.*分时.*起 每小时/s);
  assert.doesNotMatch(await page.locator('[data-flow-node="platform-weibo"]').locator('..').locator('.st-frequency-note').innerText(), /下次最早/);
  await page.evaluate(() => localStorage.setItem('dsh-social-trace:nav-hidden', 'true'));
  await page.reload();
  assert.equal(await page.locator('.st-aside').isVisible(), true);
  await page.getByRole('button', { name: '恢复连接', exact: true }).click();
  assert.equal(await page.locator('.st-main .st-card').first().getAttribute('id'), 'st-account');
  assert.equal(await page.locator('#st-frequency').count(), 0);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: '查看微博平台', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'st-account');
  assert.equal(await page.locator('#st-account.st-focused').count(), 1);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: /^今日新增/ }).click();
  assert.equal(await page.getByRole('button', { name: /^新动态 / }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: '展开或收起全部平台', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 2);
  assert.equal(await page.locator('.st-source-group').first().isVisible(), false);
  await page.getByRole('button', { name: '展开或收起全部平台', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 16);
  const source = page.locator('.st-source-group').first();
  await page.getByRole('button', { name: '展开或收起微博博主', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 14);
  assert.match(await source.locator(':scope > summary').innerText(), /展开微博博主/);
  assert.ok(await source.locator(':scope > summary').evaluate(node => node.getBoundingClientRect().width < node.parentElement.getBoundingClientRect().width * .8), '收起节点不再占整列宽度，连线从可见按钮边缘发出');
  await page.waitForFunction(() => {
    const stage = document.querySelector('.st-flow-stage'), summary = stage.querySelector('[data-flow-node="group-weibo"]'), wire = stage.querySelector('[data-flow-edge="group-weibo"]');
    const bounds = stage.getBoundingClientRect(), box = summary.getBoundingClientRect(), scale = bounds.width / stage.offsetWidth;
    return wire && Math.abs(wire.getPointAtLength(0).x - ((box.right - bounds.left) / scale + 1)) < 2;
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.st-source-group')?.open === false);
  await source.locator(':scope > summary').click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 16);

  if (await page.locator('.st-library').getAttribute('open') === null) await page.locator('.st-library-head').click();
  await page.locator('[data-archive-author="1011"] > summary').click();
  await page.locator('[data-archive-author="1011"][open]').waitFor();
  await page.locator('.st-library-head').click();
  await page.getByRole('button', { name: '设置博主：示例博主甲', exact: true }).click();
  const authorSettings = page.getByRole('dialog', { name: '节点监控设置', exact: true });
  assert.equal(await authorSettings.getByRole('tab', { name: '新动态监控', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await authorSettings.getByLabel('缓存消息时间范围', { exact: true }).count(), 0);
  await authorSettings.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  assert.equal(await authorSettings.getByRole('button', { name: '保存监控时间', exact: true }).count(), 0);
  assert.match(await authorSettings.innerText(), /只能缓存当前登录账号可见的消息/);
  await authorSettings.getByRole('tab', { name: '新动态监控', exact: true }).click();
  await authorSettings.getByRole('button', { name: '修改时间段1', exact: true }).click();
  await authorSettings.getByLabel('时间段1间隔分钟', { exact: true }).fill('3');
  await authorSettings.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await authorSettings.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.equal(writes.at(-1).path, '/dsh-social-trace/targets/policy');
  assert.equal(writes.at(-1).body.uid, '1000');
  assert.equal(writes.at(-1).body.schedule.windows[0].intervalMinutes, 3);
  await authorSettings.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.getByRole('button', { name: '设置博主：示例博主甲', exact: true }).click();
  assert.match(await authorSettings.locator('.st-rule-table').innerText(), /每 3 分钟检查一次/);
  await authorSettings.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.getByRole('button', { name: '设置微博平台', exact: true }).click();
  await authorSettings.getByRole('heading', { name: '微博监控设置', exact: true }).waitFor();
  assert.match(await authorSettings.getByRole('region', { name: '独立时间配置的博主', exact: true }).innerText(), /示例博主甲/);
  assert.doesNotMatch(await authorSettings.getByRole('region', { name: '独立时间配置的博主', exact: true }).innerText(), /示例博主乙/);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await authorSettings.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-25-schedule.png') });
  await authorSettings.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await authorSettings.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.equal(writes.at(-1).body.applyToAll, undefined);
  assert.equal(state.targets[0].policy.schedule.windows[0].intervalMinutes, 3, '平台保存不清除个人设置');
  await authorSettings.getByRole('button', { name: '查看示例博主甲的独立配置', exact: true }).click();
  await authorSettings.getByRole('heading', { name: '示例博主甲的监控设置', exact: true }).waitFor();
  await authorSettings.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.getByRole('button', { name: '设置微博平台', exact: true }).click();

  assert.deepEqual(await authorSettings.locator('.st-rule-table th').allTextContents(), ['执行时间（北京时间）', '检查频率', '操作']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '设置 Social Trace Agent', exact: true }).click();
  const agentDialog = page.getByRole('dialog', { name: 'Social Trace Agent 设置', exact: true });
  await agentDialog.getByRole('heading', { name: 'Social Trace Agent', exact: true }).waitFor();
  assert.equal(await agentDialog.getByRole('table', { name: '监控时间安排', exact: true }).count(), 0);
  await agentDialog.getByRole('tab', { name: '添加渠道', exact: true }).click();
  await agentDialog.getByLabel('推送接收目标').selectOption('demo-target');
  assert.equal(await agentDialog.getByText('用接收消息的账号给机器人发一条消息。', { exact: true }).isVisible(), false);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await agentDialog.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-33-agent-desktop.png') });
  await agentDialog.getByRole('tab', { name: '已添加渠道', exact: true }).click();
  await agentDialog.getByRole('switch', { name: '自动推送新动态', exact: true }).uncheck();
  await agentDialog.getByRole('status').filter({ hasText: '自动推送已关闭' }).waitFor();
  assert.equal(state.agent.config.enabled, false);
  await agentDialog.getByLabel('推送博主范围').selectOption('selected');
  await agentDialog.getByRole('button', { name: '保存博主范围', exact: true }).click();
  await agentDialog.getByRole('status').filter({ hasText: '推送博主范围已保存' }).waitFor();
  assert.equal(state.agent.config.uids.length, targets.length);
  await agentDialog.getByRole('tab', { name: '投递记录', exact: true }).click();
  await agentDialog.getByRole('table').waitFor();
  assert.match(await agentDialog.innerText(), /平台已接受/);
  await agentDialog.getByRole('tab', { name: '已添加渠道', exact: true }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  assert.ok(await agentDialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await agentDialog.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-33-agent-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.keyboard.press('Escape');
  const beforeUpdate = writes.length;
  await page.getByRole('button', { name: '检查插件更新', exact: true }).click();
  const updateDialog = page.getByRole('dialog', { name: '版本更新', exact: true });
  await updateDialog.getByText('有新版本 v0.2.0 可用', { exact: true }).waitFor();
  assert.equal(writes.length, beforeUpdate, '打开窗口和检查不能触发安装');
  await page.setViewportSize({ width: 480, height: 900 });
  assert.ok(await updateDialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await updateDialog.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-update-mobile.png') });
  await updateDialog.getByRole('button', { name: '一键更新', exact: true }).click();
  await updateDialog.getByRole('status').filter({ hasText: '已安装' }).waitFor();
  assert.equal(writes.at(-1).path, '/dsh-social-trace/update');
  assert.equal(writes.at(-1).body.version, '0.2.0');
  await updateDialog.getByRole('button', { name: '关闭版本更新', exact: true }).click();
  state.update = { ...state.update, currentVersion: '0.2.0', latestVersion: null, updateAvailable: false, phase: 'idle', checkFailed: true, result: null };
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  await page.getByRole('button', { name: '检查插件更新', exact: true }).click();
  await updateDialog.getByRole('status').filter({ hasText: '可能尚未发布' }).waitFor();
  assert.equal(await updateDialog.getByRole('button', { name: '一键更新', exact: true }).isDisabled(), true);
  await updateDialog.getByRole('button', { name: '关闭版本更新', exact: true }).click();
  const focusMira = page.getByRole('button', { name: '展开或收起博主卡片：Mira Builds', exact: true });
  await focusMira.click();
  assert.equal(await page.locator('.st-author-node.selected,.st-author-node.muted').count(), 0);
  assert.equal(await page.locator('.st-avatar-only').count(), 1);
  assert.equal(await focusMira.locator('..').locator('.st-author-info').isVisible(), false);
  assert.equal(await focusMira.isVisible(), true);
  assert.equal(await page.locator('[data-flow-edge="1011"]').count(), 1);
  assert.equal(await page.getByRole('heading', { name: '监控流向', exact: true }).count(), 1);
  await focusMira.click();
  assert.equal(await page.locator('.st-avatar-only').count(), 0);
  await focusMira.click();
  await page.getByRole('button', { name: '收起全部卡片', exact: true }).click();
  assert.equal(await page.locator('.st-avatar-only').count(), 10);
  await page.getByRole('button', { name: '展开全部卡片', exact: true }).click();
  await page.getByRole('button', { name: '查看博主：Mira Builds' }).click();
  await page.getByRole('heading', { name: '关注与档案' }).waitFor();
  const centeredArrow = await page.getByRole('button', { name: '返回博主列表', exact: true }).evaluate(button => {
    const box = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect();
    return Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) < 1 && Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2) < 1;
  });
  assert.equal(centeredArrow, true);
  await page.getByRole('button', { name: '返回博主列表', exact: true }).click();
  await page.getByRole('heading', { name: '关注与档案', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '返回博主列表', exact: true }).count(), 0);
  assert.equal(await page.locator('.st-author-overview').count(), 10);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  assert.equal(await page.locator('.st-aside').isVisible(), true);
  await page.getByRole('button', { name: '查看博主：Mira Builds', exact: true }).click();
  await page.getByRole('heading', { name: '关注与档案', exact: true }).waitFor();
  assert.equal(await page.getByLabel('筛选博主').inputValue(), '1011');
  assert.equal(await page.locator('.st-identity select').inputValue(), '1011');
  assert.equal(await page.locator('.st-page-title .st-muted').count(), 0);
  assert.equal(await page.locator('.st-identity select').count(), 1);
  assert.equal(await page.locator('.st-identity strong').count(), 0);
  await page.getByRole('button', { name: '全部对象', exact: true }).click();
  assert.equal(await page.locator('.st-author-overview').count(), 10);
  assert.deepEqual((await page.locator('.st-author-table th').allTextContents()).map(label => label.replace(/[↕↑↓]/g, '')), ['博主', '平台', '消息总数', '已存', '新动态', '历史缓存', '详细设置']);
  assert.equal(await page.locator('.st-author-table .st-platform-badge').count(), 10);
  assert.equal(await page.locator('.st-author-table .st-uid-tag').count(), 10);
  await page.getByRole('button', { name: '按已存排序', exact: true }).click();
  assert.match(await page.locator('.st-author-overview').first().innerText(), /示例博主甲/);
  await page.getByRole('button', { name: '按已存排序', exact: true }).click();
  assert.match(await page.locator('.st-author-overview').first().innerText(), /示例博主戊/);
  await page.getByRole('button', { name: '按消息总数排序', exact: true }).click();
  assert.match(await page.locator('.st-author-overview').first().innerText(), /Mira Builds/);
  assert.equal(await page.locator('.st-author-table th[aria-sort=descending]').count(), 1);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-21-table.png') });
  assert.equal(await page.locator('.st-state-pill').count(), 20);
  assert.equal(await page.locator('.st-state-pill svg').count(), 20);
  assert.equal(await page.locator('.st-view-tabs').count(), 0);
  assert.equal(await page.getByRole('switch').count(), 20, '列表里的两个任务状态均可直接开关');
  await page.locator('.st-author-open').filter({ hasText: 'Mira Builds' }).click();
  await page.getByRole('button', { name: '返回博主列表', exact: true }).click();
  assert.equal(await page.getByLabel('筛选博主').inputValue(), '');
  assert.equal(await page.locator('.st-author-overview').count(), 10);
  await page.locator('.st-author-open').filter({ hasText: 'Mira Builds' }).click();
  assert.equal(await page.getByRole('button', { name: '确认已读 1', exact: true }).count(), 0, '档案页移除确认已读');
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.locator('.st-library-head').click();
  await page.locator('[data-archive-author="1011"] > summary').click();
  await page.getByRole('button', { name: '确认已读 1', exact: true }).click();
  assert.equal(state.notices.find(item => item.id === 'n1').read_at > 0, true);
  assert.equal(state.notices.find(item => item.id === 'n2').read_at, undefined);
  assert.match(await page.locator('.st-saved').innerText(), /Mira Builds：新动态已全部标为已读/);
  assert.match(await page.locator('.st-saved').innerText(), /4 秒后自动关闭/);
  await page.waitForTimeout(4100);
  assert.equal(await page.locator('.st-saved').count(), 0, '成功提醒自动消退');
  await page.locator('[data-archive-author="1011"]').getByRole('button', { name: '查看已留存正文 →', exact: true }).click();
  assert.equal(await page.locator('.st-reader-task').count(), 0);
  assert.deepEqual(await page.getByRole('tablist', { name: '博主详情', exact: true }).getByRole('tab').allTextContents(), ['留存内容', '新消息监控', '历史消息缓存']);
  assert.equal(await page.getByRole('button', { name: '在大屏开启历史缓存', exact: true }).count(), 0);
  assert.match(await page.locator('.st-save-facts > div').first().innerText(), /消息总数.*约 1,000 条/s);
  assert.equal(await page.locator('.st-stats').count(), 0);
  await page.getByRole('heading', { name: '还没有留存内容', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '连接账号 / 添加博主' }).count(), 0);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  assert.equal(await page.locator('.st-author-folder[open]').count(), 0);
  if (await page.locator('.st-library').getAttribute('open') === null) await page.locator('.st-library-head').click();
  await page.locator('[data-archive-author="1011"] > summary').click();
  await page.locator('[data-archive-author="1011"][open]').waitFor();
  assert.match(await page.locator('.st-library-head').innerText(), /5,178/);
  const mira = page.locator('[data-archive-author="1011"]');
  assert.match(await mira.innerText(), /431/);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.locator('.st-library').screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-24-library.png') });
  assert.equal(await mira.getByRole('link', { name: 'Markdown ↗' }).getAttribute('href'), '/dsh-social-trace/export?format=md&uid=1011');
  const [downloaded] = await Promise.all([page.waitForEvent('download'), mira.getByRole('link', { name: 'Markdown ↗' }).click()]);
  assert.equal(downloaded.suggestedFilename(), 'social-trace-1011.md');
  await mira.getByRole('button', { name: '查看已留存正文 →' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === '关注与档案');
  assert.match(requestedPosts, /uid=1011/);
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: '关注与档案', exact: true }).count(), 1);
  assert.equal(await page.getByRole('dialog', { name: '节点监控设置', exact: true }).count(), 0);
  await page.getByRole('region', { name: '节点监控设置', exact: true }).waitFor();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();

  // A real count change from the status API triggers a bounded save pulse.
  state.count++; state.archiveSummary[4].count++;
  await page.waitForFunction(() => document.querySelector('.st-library-head')?.textContent.includes('5,179'));
  await page.waitForFunction(() => document.querySelectorAll('.st-save-particle').length === 3);
  assert.equal(await page.locator('.st-save-particle[data-direction="forward"]').count(), 3);
  assert.equal(await page.locator('[data-flow-edge="1011"]').locator('..').getAttribute('data-saving'), 'true');
  assert.equal(await page.locator('[data-flow-edge="1000"]').locator('..').getAttribute('data-saving'), null);
  await page.waitForFunction(() => Number(document.querySelector('.st-save-particle').getAttribute('opacity')) === 0 && Number(getComputedStyle(document.querySelector('.st-save-particle')).opacity) > 0);
  const saveX = await page.locator('.st-save-particle').first().evaluate(node => node.getCTM().e);
  await page.waitForTimeout(120);
  assert.ok(await page.locator('.st-save-particle').first().evaluate(node => node.getCTM().e) > saveX, '真实入库粒子向右移动');
  assert.match(await page.locator('.st-save-feedback').innerText(), /1 条已入库/);
  // Keep the screen mounted through the entire animation expiry (the old crash happened here).
  await page.waitForFunction(() => !document.querySelector('.st-save-feedback'), { timeout: 7000 });
  assert.equal(await page.locator('.st-main h1').count(), 1, '入库动效结束后主界面仍然可用');
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '查看博主：示例博主甲' }).click();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 0);

  const librarySummary = page.locator('.st-library-head');
  if (await page.locator('.st-library').getAttribute('open') === null) await librarySummary.click();
  await librarySummary.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.st-library').open === false);
  assert.match(await librarySummary.innerText(), /5,179/);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('.st-flow-particle').count(), 0);

  state.account.status = 'ready'; state.account.reason = '';
  state.jobs = [{ id: 'reading', uid: '1011', kind: 'updates', status: 'queued' }]; state.activeJobId = 'reading';
  state.progress[0].nextCheckAt = Date.now() + 60000;
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 2);
  assert.equal(await page.locator('.st-probe-particle[data-direction="reverse"]').count(), 2);
  const probeDirection = await page.locator('.st-flow-svg').evaluate(svg => {
    const particle = svg.querySelector('[data-flow-edge="platform-x"]').parentElement.querySelector('.st-probe-particle');
    svg.pauseAnimations(); svg.setCurrentTime(.15); const start = particle.getCTM().e;
    svg.setCurrentTime(.65); const end = particle.getCTM().e;
    svg.unpauseAnimations(); return { start, end };
  });
  assert.ok(probeDirection.end < probeDirection.start, '定时探测粒子向左移动');
  assert.equal(await page.locator('.st-save-particle').count(), 0);
  // Waiting between real requests still has a regular monitoring heartbeat.
  state.activeJobId = null;
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-probe-particle').length === 2);
  assert.match(await page.locator('[data-flow-node="platform-x"]').innerText(), /监控中/);
  assert.match(await page.locator('[data-flow-node="platform-x"]').locator('..').locator('.st-frequency-note').innerText(), /每 15 分钟/);
  state.account.cooldown_until = Date.now() + 60000; state.account.errors = 1; state.account.reason = '网络暂时异常';
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-probe-particle').length === 0);
  assert.match(await page.locator('[data-flow-node="platform-x"]').innerText(), /采集异常.*等待重试/);
  state.account.cooldown_until = 0; state.account.errors = 0; state.account.reason = '';
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-probe-particle').length === 2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.st-flow-particle').first().isVisible(), false);

  for (const width of [1024, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}px`);
  }

  // The actual two-platform contract: paused Weibo must not hide running Xueqiu.
  state.targets = [targets[0], { uid: 'xueqiu:1000', external_uid: '1000', name: '雪球测试作者', platform: 'xueqiu' }];
  state.accounts = { weibo: { status: 'paused', cooldown_until: 0, reason: '微博暂停' }, xueqiu: { status: 'ready', cooldown_until: 0, reason: '' } };
  state.platforms = ['weibo', 'xueqiu'].map(id => ({ id, name: id === 'weibo' ? '微博' : '雪球', requestGapMs: id === 'weibo' ? 15000 : 30000,
    targetDefaults: { historyGapMs: 60000, intervalMs: 900000 }, stopped: false }));
  state.jobs = [{ id: 'snow-reading', uid: 'xueqiu:1000', platform: 'xueqiu', kind: 'updates', status: 'queued' }];
  state.activeJobIds = ['snow-reading'];
  state.archiveSummary = [{ uid: '1000', count: 1280 }, { uid: 'xueqiu:1000', count: 3 }]; state.count = 1283;
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 2);
  assert.match(await page.locator('[data-flow-node="platform-xueqiu"]').innerText(), /正在读取/);
  assert.match(await page.locator('[data-flow-node="platform-weibo"]').innerText(), /连接待恢复/);
  await page.getByRole('switch', { name: '雪球监控开关', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-flow-edge="platform-xueqiu"]'));
  assert.equal(writes.at(-1).body.platform, 'xueqiu');
  assert.equal(await page.locator('.st-author-node.st-branch-paused').count(), 1);
  assert.equal(await page.locator('.st-author-node.st-branch-paused .st-flow-avatar').evaluate(node => getComputedStyle(node).filter), 'grayscale(1)');
  await page.getByRole('switch', { name: '雪球监控开关', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-flow-edge="platform-xueqiu"]'));
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('tab', { name: '雪球', exact: true }).click();
  await page.getByRole('region', { name: '雪球账号连接', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '信息保存位置', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '打开插件设置', exact: true }).count(), 0);
  assert.equal(await page.locator('.st-page-title .st-muted').count(), 0);
  await page.getByRole('tab', { name: 'X', exact: true }).click();
  await page.getByRole('heading', { name: 'X · 开发中' }).waitFor();
  await page.getByRole('tab', { name: '微博', exact: true }).click();
  await page.getByRole('region', { name: '微博账号连接' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '新动态监控', exact: true }).count(), 0);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: '设置微博平台', exact: true }).click();
  assert.equal(await page.getByLabel('两次请求至少间隔（秒）').count(), 0);
  assert.equal(await page.getByLabel('历史缓存每页等待秒数').count(), 0);
  assert.equal(await page.getByRole('tab', { name: '新动态监控', exact: true }).getAttribute('aria-selected'), 'true');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/settings')),
    page.getByRole('button', { name: '保存监控时间' }).click()]);
  assert.equal(writes.at(-1).body.platform, 'weibo');
  assert.equal(writes.at(-1).body.requestGapSeconds, undefined);
  await page.getByRole('switch', { name: '按时间段调整频率（北京时间）', exact: true }).check();
  assert.equal(await page.getByRole('button', { name: '修改时间段1', exact: true }).count(), 0, '启用分时也不凭空添加预设时段');
  await page.getByRole('button', { name: '+ 添加时间段', exact: true }).click();
  assert.equal(await page.getByLabel('时间段1开始', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('时间段1重复方式', { exact: true }).inputValue(), 'weekdays');
  assert.equal(await page.getByLabel('时间段1结束', { exact: true }).inputValue(), '');
  await page.getByLabel('时间段1开始', { exact: true }).fill('08:00');
  await page.getByLabel('时间段1结束', { exact: true }).fill('15:00');
  await page.getByLabel('时间段1间隔分钟', { exact: true }).fill('1');
  await page.getByRole('button', { name: '修改其他时间频率', exact: true }).click();
  await page.getByLabel('其他时间间隔（分钟）', { exact: true }).fill('60');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/settings') && response.request().method() === 'POST'), page.getByRole('button', { name: '保存监控时间', exact: true }).click()]);
  assert.deepEqual(writes.at(-1).body.schedule, { enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1, repeat: 'weekdays' }] });
  await page.getByRole('button', { name: '+ 添加时间段', exact: true }).click();
  assert.equal(await page.getByLabel('时间段2开始', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('时间段2结束', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('时间段2间隔分钟', { exact: true }).inputValue(), '');
  await page.getByLabel('时间段2开始', { exact: true }).fill('18:30');
  await page.getByLabel('时间段2结束', { exact: true }).fill('20:45');
  await page.getByLabel('时间段2间隔分钟', { exact: true }).fill('9');
  await page.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.deepEqual(writes.at(-1).body.schedule.windows[1], { start: '18:30', end: '20:45', intervalMinutes: 9, repeat: 'weekdays' });
  if (await page.getByLabel('时间段2重复方式', { exact: true }).count() === 0) await page.getByRole('button', { name: '修改时间段2', exact: true }).click();
  await page.getByLabel('时间段2重复方式', { exact: true }).selectOption('weekly');
  await page.getByLabel('时间段2首次日期', { exact: true }).fill('2026-11-06');
  await page.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.equal(writes.at(-1).body.schedule.windows[1].repeat, 'weekly');
  assert.equal(writes.at(-1).body.schedule.windows[1].date, '2026-11-06');
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.getByRole('dialog', { name: '节点监控设置', exact: true }).screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-33-repeat-editor.png') });

  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  await page.getByLabel('历史缓存每页等待秒数').fill('90');
  await page.getByRole('button', { name: '保存缓存速度', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '历史缓存速度已保存' }).waitFor();
  assert.equal(writes.at(-1).path, '/dsh-social-trace/settings/history');
  assert.deepEqual(writes.at(-1).body, { platform: 'weibo', historyGapSeconds: 90 });
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.getByRole('dialog', { name: '节点监控设置', exact: true }).screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-26-history.png') });


  await page.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.st-workspace input')?.value === '/tmp/Social Trace selected');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/workspace')),
    page.getByRole('button', { name: '保存位置', exact: true }).click()]);
  assert.equal(writes.at(-1).body.directory, '/tmp/Social Trace selected');
  await page.getByRole('status').filter({ hasText: '信息保存位置已更新' }).waitFor();
  const writesBeforeNative = writes.length;
  await page.evaluate(() => { window.__DSH_DIRECTORY_PICKER__ = { pick: async () => '/tmp/native selected' }; });
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.st-workspace input')?.value === '/tmp/native selected');
  assert.equal(writes.length, writesBeforeNative);
  await page.evaluate(() => { window.__DSH_DIRECTORY_PICKER__.pick = async () => null; });
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '信息保存位置', exact: true }).inputValue(), '/tmp/native selected');
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(await page.locator('.st-aside').isVisible(), true);
  assert.equal(await page.locator('.st-aside').evaluate(node => getComputedStyle(node).position), 'static');
  assert.equal(await page.locator('.st-layout').evaluate(node => getComputedStyle(node).flexDirection), 'column');
  assert.equal(await page.locator('.st-nav-toggle,.st-nav-close').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('tab', { name: '微博', exact: true }).click();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: '+ 添加博主', exact: true }).click();
  await page.getByRole('dialog', { name: '添加微博博主', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '去连接微博', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '关闭添加博主', exact: true }).click();
  state.account.status = 'ready';
  if (state.accounts?.weibo) state.accounts.weibo.status = 'ready';
  await page.reload();
  await page.getByRole('button', { name: '+ 添加博主', exact: true }).click();
  await page.getByRole('textbox', { name: '微博博主主页或 UID', exact: true }).fill('9000000000');
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  assert.ok(await page.getByRole('region', { name: '确认记录方式' }).getByText('2,345 条微博').isVisible());
  assert.equal(writes.some(item => item.path.endsWith('/targets/start')), false);
  await page.getByRole('button', { name: '设置历史缓存', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: '关注与档案', exact: true }).count(), 1);
  await page.getByLabel('缓存消息时间范围', { exact: true }).selectOption('custom');
  await page.getByLabel('缓存消息时间范围开始日期').fill('2026-10-01');
  await page.getByLabel('缓存消息时间范围结束日期').fill('2026-11-01');
  await page.getByRole('button', { name: '确认并开始记录', exact: true }).click();
  await page.getByRole('button', { name: '暂停缓存', exact: true }).waitFor();
  await page.getByRole('tab', { name: '留存内容', exact: true }).click();
  await page.getByRole('region', { name: '9000000000保存进度' }).waitFor();
  const startWrite = writes.find(item => item.path.endsWith('/targets/start'));
  assert.equal(startWrite.body.mode, 'history');
  assert.equal(startWrite.body.from, '2026-10-01');
  assert.equal(startWrite.body.to, '2026-11-01');
  await page.getByRole('heading', { name: '关注与档案', exact: true }).waitFor();
  assert.equal(await page.getByLabel('筛选博主').inputValue(), '9000000000');
  assert.equal(await page.locator('.st-identity select').inputValue(), '9000000000');
  const progressCard = page.getByRole('region', { name: '9000000000保存进度' });
  await progressCard.waitFor();
  assert.match(await progressCard.locator('.st-save-facts > div').first().innerText(), /总数待确认/);
  assert.match(await progressCard.locator('.st-save-facts > div').nth(2).innerText(), /最近保存.*尚未保存/s);
  assert.match(await progressCard.innerText(), /尚未保存/);
  assert.equal(await progressCard.locator('.st-progress-details').count(), 0);
  assert.equal(await page.getByRole('tab', { name: '缓存进度', exact: true }).count(), 0);
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  const nodeDialog = page.locator('[aria-label="节点监控设置"]');
  await nodeDialog.waitFor();
  await nodeDialog.getByRole('button', { name: '暂停缓存', exact: true }).click();
  await nodeDialog.getByRole('button', { name: '继续缓存', exact: true }).waitFor();
  await nodeDialog.getByLabel('仅缓存原创（不含转发）', { exact: true }).check();
  await nodeDialog.getByRole('button', { name: '应用筛选并缓存', exact: true }).click();
  assert.equal(writes.at(-1).body.originalOnly, true);
  await nodeDialog.getByRole('button', { name: '暂停缓存', exact: true }).waitFor();
  assert.equal(await nodeDialog.getByRole('button', { name: '开始缓存', exact: true }).count(), 0);
  assert.equal(await nodeDialog.getByRole('button', { name: /缓存中|已安排，等待执行/, exact: true }).count(), 0);
  await page.getByRole('tab', { name: '留存内容', exact: true }).click();
  await page.getByRole('heading', { name: '还没有留存内容', exact: true }).waitFor();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  const newAuthor = page.locator('[data-flow-node="author-9000000000"]').locator('..');
  assert.match((await newAuthor.locator('.st-stream-status').allInnerTexts()).join('\n'), /新动态\s*监控中\s*历史缓存\s*缓存中/);
  assert.equal(await newAuthor.locator('.st-author-storage').count(), 0);
  assert.doesNotMatch(await newAuthor.innerText(), /下次最早|本地累计|已留存/);
  assert.equal(await newAuthor.locator('.st-author-master').count(), 0);
  await newAuthor.getByRole('switch', { name: '9000000000新动态开关', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="9000000000新动态开关"]')?.getAttribute('aria-checked') === 'false');
  assert.match((await newAuthor.locator('.st-stream-status').allInnerTexts()).join('\n'), /新动态\s*已暂停\s*历史缓存\s*缓存中/);
  assert.equal(writes.at(-1).path, '/dsh-social-trace/jobs/new-target/pause');
  await newAuthor.getByRole('switch', { name: '9000000000新动态开关', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="9000000000新动态开关"]')?.getAttribute('aria-checked') === 'true');
  assert.equal(writes.at(-1).path, '/dsh-social-trace/jobs/new-target/resume');
  assert.equal(await page.locator('.st-hub-foot').count(), 0);
  assert.doesNotMatch(await page.locator('.st-hub-jobs').innerText(), /等待下一批|每.*分钟|监控中/);
  assert.equal(await newAuthor.locator('.st-node-progress').count(), 0);
  await newAuthor.locator('.st-stream-status').last().click();
  assert.equal(await nodeDialog.getByRole('tab', { name: '历史消息缓存', exact: true }).getAttribute('aria-selected'), 'true');
  await nodeDialog.getByRole('button', { name: '暂停缓存', exact: true }).click();
  await nodeDialog.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  assert.match((await newAuthor.locator('.st-stream-status').allInnerTexts()).join('\n'), /新动态\s*监控中\s*历史缓存\s*已暂停/);
  await newAuthor.getByRole('switch', { name: '9000000000新动态开关', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-flow-edge="9000000000"]'));
  assert.equal(await newAuthor.locator('.st-flow-avatar').evaluate(node => getComputedStyle(node).filter), 'grayscale(1)');
  await newAuthor.getByRole('switch', { name: '9000000000新动态开关', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('[data-flow-edge="9000000000"]'));
  assert.equal(await newAuthor.locator('.st-flow-avatar').evaluate(node => getComputedStyle(node).filter), 'none');
  await newAuthor.locator('.st-stream-status').last().click();
  await nodeDialog.getByRole('button', { name: '继续缓存', exact: true }).click();
  await nodeDialog.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.getByRole('button', { name: '查看博主：9000000000', exact: true }).click();
  postFixture = [{ id: 'p1', uid: '9000000000', author: '配图测试', text: '分享图片', published_at: Date.now() - 60000, detected_at: Date.now() - 5000, first_seen_at: Date.now(), complete: true,
    url: 'https://weibo.com/u/9000000000', images: ['https://wx1.sinaimg.cn/test.jpg'], quote: { author: '原作者', text: '原博正文内容'.repeat(60), images: [] } }];
  await page.getByLabel('搜索留存正文').fill('配图');
  await page.waitForFunction(() => document.querySelector('.st-image-grid img')?.naturalWidth > 0);
  assert.match(await page.locator('article .st-event-times').innerText(), /博主发布：.*监控发现：/s);
  assert.equal(await page.locator('.st-quote').getAttribute('open'), null);
  assert.equal(await page.locator('.st-quote-body').isVisible(), false);
  await page.locator('.st-quote > summary').click();
  assert.equal(await page.locator('.st-quote-body').isVisible(), true);
  await page.getByRole('button', { name: '查看配图 1', exact: true }).click();
  assert.equal(await page.locator('.st-lightbox').getAttribute('open'), '');
  await page.getByRole('button', { name: '关闭大图', exact: true }).click();
  const pager = await page.locator('.st-pagination').evaluate(node => ({ align: getComputedStyle(node).justifyContent }));
  assert.equal(pager.align, 'flex-end');
  postFixture = [];
  await page.getByRole('button', { name: /^消息中心/ }).click();
  assert.equal(await page.getByRole('button', { name: '返回博主列表', exact: true }).count(), 0, '一级消息中心没有返回按钮');
  assert.equal(await page.locator('.st-message-row').count(), 3);
  assert.equal(await page.locator('.st-notice.st-card').count(), 0);
  await page.getByRole('button', { name: /^待处理/ }).click();
  assert.equal(await page.locator('.st-message-row').count(), 1);
  await page.getByRole('button', { name: '本类标为已读', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.st-message-row.unread'));
  assert.equal(state.notices.find(item => item.id === 'n2').read_at > 0, true);
  assert.equal(state.notices.find(item => item.id === 'n3').read_at, undefined);
  assert.equal(writes.at(-1).body.kind, 'attention');
  await page.locator('.st-message-toolbar .st-feed-filters button').first().click();
  await page.getByRole('button', { name: '全部标为已读', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.st-message-row.unread'));
  assert.equal(await page.locator('.st-nav-badge').count(), 0, '全部已读后导航与分类角标全部消失');
  assert.equal(await page.locator('.st-message-type:not(.read)').count(), 0);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();

  state.targets = []; state.jobs = []; state.count = 0; state.archiveSummary = []; state.activeJobIds = [];
  state.accounts = { weibo: { status: 'needs_login', cooldown_until: 0 }, xueqiu: { status: 'needs_login', cooldown_until: 0 } };
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-wire').length === 5);
  assert.equal(await page.locator('.st-source-group').count(), 1);
  assert.equal(await page.locator('.st-author-folder').count(), 3);
  assert.equal(await page.locator('.st-flow-particle').count(), 4);
  assert.match(await page.locator('.st-mode-label').innerText(), /效果预览/);
  assert.equal(await page.locator('.st-library a[download]').count(), 0);
  const writesBeforePreview = writes.length;
  await page.getByRole('switch', { name: '总控制器监控开关' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 0);
  await page.getByRole('switch', { name: '总控制器监控开关' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 4);
  await page.getByRole('switch', { name: '微博监控开关' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 0);
  await page.getByRole('switch', { name: '微博监控开关' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-flow-particle').length === 4);

  await page.getByRole('button', { name: '查看博主：示例博主 A' }).click();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  assert.equal(writes.length, writesBeforePreview);
  assert.doesNotMatch(requestedPosts, /preview-/);
  for (const width of [1400, 1150, 960, 760]) {
    await page.evaluate(width => { document.getElementById('root').style.width = width + 'px'; }, width);
    await page.waitForTimeout(100);
    const sizes = await page.locator('.st-flow-platform').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return [rect.width, rect.height];
    }));
    assert.ok(sizes.every(([w, h]) => Math.abs(w - h) < 1), `platforms must stay square in a ${width}px parent: ${JSON.stringify(sizes)}`);
    assert.equal(await page.locator('#root').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    if (width >= 1150) {
      await page.waitForFunction(() => {
        const stage = document.querySelector('.st-flow-stage'), from = stage.querySelector('[data-flow-node^="author-"]');
        return Math.abs(stage.querySelector('.st-flow-wire').getPointAtLength(0).x - (from.getBoundingClientRect().right - stage.getBoundingClientRect().left + 1)) < 2;
      });
      const endpoint = await page.locator('.st-flow-stage').evaluate(stage => {
      const path = stage.querySelector('.st-flow-wire'); const from = stage.querySelector('[data-flow-node^="author-"]');
      const point = path.getPointAtLength(0), box = from.getBoundingClientRect(), parent = stage.getBoundingClientRect();
      return { point: point.x, expected: box.right - parent.left + 1, stage: parent.width };
      });
      assert.ok(Math.abs(endpoint.point - endpoint.expected) < 2, `wire endpoint at ${width}: ${JSON.stringify(endpoint)}`);
    }
  }
  await page.evaluate(() => { document.getElementById('root').style.width = ''; });
  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `preview overflow at ${width}`);
  }
  emptyStatus = true; await page.reload();
  await page.getByRole('alert').filter({ hasText: 'HTTP 404' }).waitFor();
  assert.doesNotMatch(await page.locator('.st').innerText(), /Unexpected end of JSON/);
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('heading', { name: '后台尚未连接' }).waitFor();
  emptyStatus = false;
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await page.getByRole('region', { name: '信息保存位置', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重新登录', exact: true }).count(), 0);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.locator('.st-settings-page').screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-34-settings.png') });
  assert.equal(await page.getByRole('alert').filter({ hasText: 'HTTP 404' }).count(), 0);
  assert.deepEqual(errors, []);
});


test('新用户实际界面：登录、添加、只读资料、选择从现在记录，设置和返回不丢配置', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-onboarding-'));
  let logins = 0, profiles = 0;
  class DemoWeibo {
    id = 'weibo'; name = '微博';
    parseAuthor = parseAuthor;
    async login() { logins++; }
    async checkLogin() { runtime.store.setAccount({ next_request_at: Date.now() + 1800 }); return '8000000000'; }
    async profile(uid, options) { profiles++; await runtime.worker.beforeRequest(options); if (!options?.interactiveProfile && profiles === 1) { runtime.store.setAccount({ next_request_at: Date.now() + 200 }); throw new CaptureError('wait', '等待账号请求间隔', 200); } return { name: '演示博主', avatar: null, total: 286 }; }
    async close() {}
  }
  const runtime = createRuntime(directory, { updates: offlineUpdates(), adapterFactories: { weibo: DemoWeibo } });
  const server = createServer((req, res) => {
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    return runtime.handle(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(async () => { await browser.close(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '开始配置 →', exact: true }).click();
  await page.getByRole('list', { name: '首次使用流程' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加并读取资料', exact: true }).count(), 0);
  await page.getByRole('button', { name: '登录微博', exact: true }).click();
  await page.getByRole('button', { name: '我已登录，继续', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="微博博主主页或 UID"]')?.disabled === false);
  assert.equal(logins, 1);
  await page.getByLabel('微博博主主页或 UID', { exact: true }).fill('https://weibo.com/u/9000000000');
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  assert.equal(profiles, 1, '进入设置立即独立读取资料，不等待后台请求间隔');
  assert.ok(runtime.store.account().next_request_at > Date.now(), '后台请求间隔仍然保留');
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.st-author-title strong')?.textContent === '演示博主');
  assert.equal(runtime.store.target('9000000000').capture_mode, 'pending', '读取资料与是否开启监控独立');
  assert.equal(runtime.store.dueJob(Date.now()), null);
  await page.getByRole('button', { name: '查看博主：演示博主', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  assert.equal(profiles, 1);
  assert.equal(runtime.store.target('9000000000').name, '演示博主');
  assert.equal(runtime.store.count(), 0);
  assert.equal(runtime.store.dueJob(Date.now()), null);
  assert.equal(await page.getByRole('region', { name: '确认记录方式' }).getByText('286 条微博').isVisible(), true);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-12-onboarding.png') });
  await page.getByRole('button', { name: '更改保存位置', exact: true }).click();
  await page.getByRole('region', { name: '信息保存位置', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重新登录', exact: true }).count(), 0);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.locator('.st-settings-page').screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-34-settings.png') });
  assert.equal(await page.getByRole('button', { name: '返回博主列表', exact: true }).count(), 0);
  await page.locator('.st-follow-menu > summary').click();
  await page.locator('.st-follow-menu > summary').click();
  assert.equal(await page.locator('.st-follow-children').isVisible(), false);
  const navAlignment = await page.locator('.st-follow-menu > summary').evaluate(node => {
    const label = node.querySelector('.st-follow-label').getBoundingClientRect(), icon = node.querySelector('.st-follow-fold').getBoundingClientRect();
    return Math.abs(label.top + label.height / 2 - icon.top - icon.height / 2);
  });
  assert.ok(navAlignment < 1, '整行点击折叠，箭头与文字垂直居中');
  assert.equal(await page.getByRole('heading', { name: '关注与档案', exact: true }).count(), 1);
  await page.locator('.st-follow-menu > summary').click();
  assert.equal(await page.locator('.st-follow-children').isVisible(), true);
  await page.locator('.st-author-open').filter({ hasText: '演示博主' }).click();
  await page.getByRole('button', { name: '从现在开始', exact: true }).click();
  await page.getByRole('region', { name: '演示博主保存进度', exact: true }).waitFor();
  assert.equal(runtime.store.target('9000000000').capture_mode, 'from_now');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'history').status, 'paused');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'updates').status, 'queued');
  assert.equal(await page.getByRole('tab', { name: '历史消息缓存', exact: true }).count(), 1);
  assert.equal(await page.getByRole('switch').count(), 0, '留存内容页不混放任务开关');
  await page.getByRole('heading', { name: '还没有留存内容', exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: '内容翻页', exact: true }).count(), 0);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-28-reader.png') });
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  const firstHistory = page.getByRole('region', { name: '节点监控设置', exact: true });
  assert.equal(runtime.store.jobs().find(job => job.kind === 'history').status, 'paused');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  await firstHistory.getByRole('button', { name: '修改全天频率', exact: true }).click();
  await firstHistory.getByLabel('每隔多少分钟检查一次', { exact: true }).fill('7');
  await firstHistory.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await firstHistory.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.equal(runtime.store.getSetting('targetPolicy:9000000000').intervalMs, 420000);
  assert.equal(runtime.store.targetProgress().find(item => item.uid === '9000000000').intervalMs, 420000);
  await page.getByRole('tab', { name: '留存内容', exact: true }).click();
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  assert.match(await firstHistory.locator('.st-rule-table').innerText(), /每 7 分钟检查一次/);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-29-monitor.png') });
  const modalUpdates = firstHistory.getByRole('switch', { name: '演示博主新动态开关', exact: true });
  await modalUpdates.click();
  await page.waitForFunction(() => document.querySelector('.st-inline-settings [role="switch"]')?.getAttribute('aria-checked') === 'false');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'updates').status, 'paused');
  await modalUpdates.click();
  await page.waitForFunction(() => document.querySelector('.st-inline-settings [role="switch"]')?.getAttribute('aria-checked') === 'true');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'updates').status, 'queued');
  assert.equal(runtime.store.getSetting('targetPolicy:9000000000').intervalMs, 420000);
  await page.getByRole('button', { name: '返回博主列表', exact: true }).click();
  const listHistory = page.getByRole('switch', { name: '演示博主历史缓存开关', exact: true });
  await listHistory.click();
  await page.waitForFunction(() => document.querySelector('.st-author-table [aria-label="演示博主历史缓存开关"]')?.getAttribute('aria-checked') === 'true');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'history').status, 'queued');
  assert.equal(runtime.store.getSetting('targetPolicy:9000000000').intervalMs, 420000);
  await listHistory.click();
  await page.waitForFunction(() => document.querySelector('.st-author-table [aria-label="演示博主历史缓存开关"]')?.getAttribute('aria-checked') === 'false');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'history').status, 'paused');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'updates').status, 'queued');
  assert.equal(await page.getByRole('columnheader', { name: '详细设置', exact: true }).count(), 1);
  await page.getByRole('button', { name: '详细设置 →', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '节点监控设置', exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: '关注与档案', exact: true }).count(), 1);
  assert.equal(await page.getByRole('tab', { name: '新消息监控', exact: true }).getAttribute('aria-selected'), 'true');
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  // Background request spacing is silent; choosing setup gets an immediate foreground read.
  runtime.store.addTarget('9000000001', '9000000001', Date.now(), 'weibo', { captureMode: 'pending' });
  runtime.store.setAccount({ next_request_at: 0 });
  let backgroundWaited = false;
  runtime.browser.profile = async (id, options) => {
    await runtime.worker.beforeRequest(options);
    if (!options.interactiveProfile) {
      backgroundWaited = true;
      runtime.store.setAccount({ next_request_at: Date.now() + 3600000 });
      throw new CaptureError('wait', '等待下一次请求时间', 3600000);
    }
    return { name: '第二位博主', avatar: null, total: 12 };
  };
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.st-author-node').length === 2);
  await page.waitForTimeout(200);
  assert.equal(backgroundWaited, true);
  assert.equal(await page.locator('.st-saved').count(), 0, '正常后台等待不弹提醒');
  await page.getByRole('button', { name: '查看博主：9000000001', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  assert.equal(runtime.store.target('9000000001').name, '第二位博主');
  assert.ok(runtime.store.jobs().filter(job => job.uid === '9000000001').every(job => job.status === 'paused'));
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  // A component failure stays inside the plugin and provides pause/retry controls.
  await page.evaluate(() => {
    window.__testResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class { constructor() { throw new Error('UI boundary test'); } };
  });
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('heading', { name: '插件界面暂时无法显示', exact: true }).waitFor();
  await page.getByRole('button', { name: '暂停监控', exact: true }).click();
  await page.getByText('监控已暂停', { exact: true }).waitFor();
  assert.equal(runtime.store.getSetting('monitorEnabled'), false);
  await page.evaluate(() => { window.ResizeObserver = window.__testResizeObserver; });
  await page.getByRole('button', { name: '重新打开插件界面', exact: true }).click();
  await page.getByRole('heading', { name: '监控流向', exact: true }).waitFor();
  assert.equal(runtime.store.target('9000000000').capture_mode, 'from_now');
});


test('雪球真实页面流程：独立授权、读取资料、确认记录方式、频率和缓存开关', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-snow-ui-'));
  let logins = 0;
  class DemoWeibo { id = 'weibo'; name = '微博'; async close() {} }
  class DemoSnow extends XueqiuBrowser {
    async login() { logins++; }
    async checkLogin() { return '8000000000'; }
    async profile(uid, options) { await this.beforeRequest(options); return { name: '雪球演示作者', avatar: null, total: 30945 }; }
    async close() {}
  }
  const runtime = createRuntime(directory, { updates: offlineUpdates(), adapterFactories: { weibo: DemoWeibo, xueqiu: DemoSnow } });
  const server = createServer((req, res) => {
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    return runtime.handle(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(async () => { await browser.close(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('tab', { name: '雪球', exact: true }).click();
  await page.getByRole('region', { name: '雪球账号连接', exact: true }).waitFor();
  await page.getByRole('button', { name: '登录雪球', exact: true }).click();
  await page.getByRole('button', { name: '我已登录，继续', exact: true }).click();
  await page.getByRole('region', { name: '雪球账号连接', exact: true }).getByText('已登录', { exact: true }).waitFor();
  assert.equal(logins, 1);
  assert.equal(runtime.store.account().status, 'needs_login');
  assert.equal(runtime.store.account('xueqiu').status, 'ready');
  await page.getByRole('dialog', { name: '添加雪球博主', exact: true }).waitFor();
  await page.getByLabel('雪球博主主页或 UID', { exact: true }).fill('https://www.xueqiu.com/u/9000000002');
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  const key = 'xueqiu:9000000002';
  assert.equal(runtime.store.target(key).name, '雪球演示作者');
  assert.equal(runtime.store.target(key).capture_mode, 'pending');
  assert.ok(await page.getByRole('region', { name: '确认记录方式' }).getByText('30,945 条消息').isVisible());
  await page.getByRole('button', { name: '从现在开始', exact: true }).click();
  await page.getByRole('region', { name: '雪球演示作者保存进度', exact: true }).waitFor();
  assert.equal(runtime.store.target(key).capture_mode, 'from_now');
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  await page.getByRole('button', { name: '修改全天频率', exact: true }).click();
  await page.getByLabel('每隔多少分钟检查一次', { exact: true }).fill('5');
  await page.getByRole('button', { name: '保存监控时间', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '监控时间与频率已保存' }).waitFor();
  assert.equal(runtime.store.monitoringPolicy(runtime.store.target(key)).intervalMs, 300000);
  const update = runtime.store.jobs().find(j => j.uid === key && j.kind === 'updates');
  runtime.store.updateJob(update.id, { checkpoint: { catchupFrom: Date.now() - 86400000, catchupSaved: 0, page: 2 } });
  await page.reload();
  await page.locator('.st-follow-menu > summary').click();
  await page.locator('.st-author-open').filter({ hasText: '雪球演示作者' }).click();
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '正在补查离线期间的动态' }).waitFor();
  const catchupToggle = page.getByRole('switch', { name: '雪球演示作者新动态开关', exact: true });
  assert.match(await catchupToggle.innerText(), /补查中/);
  assert.match(await catchupToggle.getAttribute('class'), /running/);
  await page.waitForFunction(() => { const tab = document.querySelector('.st-reader-tabs [aria-selected=\"true\"]'); return tab && getComputedStyle(tab).borderBottomColor === getComputedStyle(tab).color; });
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-36-catchup.png') });
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  await page.getByLabel('仅缓存原创（不含转发）', { exact: true }).check();
  await page.getByRole('button', { name: '应用筛选并缓存', exact: true }).click();
  await page.getByRole('button', { name: '暂停缓存', exact: true }).waitFor();
  assert.equal(runtime.store.getSetting('historyOriginalOnly:' + key), true);
  await page.getByRole('button', { name: '暂停缓存', exact: true }).click();
  await page.getByRole('button', { name: '继续缓存', exact: true }).waitFor();
  assert.equal(runtime.store.jobs().find(j => j.uid === key && j.kind === 'history').status, 'paused');
  assert.equal(runtime.sources.xueqiu.worker.requestGapMs, 30000);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'social-trace-35-xueqiu.png') });
  assert.deepEqual(errors, []);
});

for (const platform of ['weibo', 'xueqiu']) test(`${platform} 全流程与布局：添加到入库、配图、导出、消息已读、IM、异常处理和平台上下文`, async t => {
  const { normalizePost: normalizeWeibo } = await import('../lib/platforms/weibo/index.js');
  const { normalizePost: normalizeSnow } = await import('../lib/platforms/xueqiu/index.js');
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-journey-'));
  const name = platform === 'weibo' ? '微博' : '雪球', author = name + '长名字测试作者', externalUid = '1234567890';
  const key = platform === 'weibo' ? externalUid : 'xueqiu:' + externalUid;
  const imageUrl = platform === 'weibo' ? 'https://wx1.sinaimg.cn/journey.png' : 'https://xqimg.imedao.com/journey.png';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, options) => String(url) === imageUrl ? Promise.resolve(new Response(png, { headers: { 'Content-Type': 'image/png' } })) : nativeFetch(url, options));
  let logins = 0, rejectVerification = true, rawPosts = [], clock = Date.now();
  const deliveries = [];
  const im = { listBots: async () => [{ botId: 'mock-bot', channel: 'weixin' }, { botId: 'qq-bot', channel: 'qq' }], listTargets: async bot => bot === 'qq-bot' ? [{ targetId: 'qq-chat', name: 'QQ 测试接收人', kind: 'user' }] : [{ targetId: 'mock-chat', name: '测试接收人', kind: 'user' }], send: async (...args) => { deliveries.push(args); return { sent: true }; } };
  class DemoPlatform {
    constructor(_, beforeRequest) { this.id = platform; this.name = name; this.beforeRequest = beforeRequest; }
    parseAuthor(input) { const uid = input.match(/\d{10}/)?.[0]; if (!uid) throw Error('请输入有效主页或 UID'); return uid; }
    async login() { logins++; }
    async checkLogin() { if (rejectVerification) { rejectVerification = false; throw new CaptureError('login', '尚未完成登录，请主动打开授权窗口'); } return '8000000000'; }
    async profile(_, options) { await this.beforeRequest(options); return { name: author, avatar: imageUrl, total: 137 }; }
    normalizePost = platform === 'weibo' ? normalizeWeibo : normalizeSnow;
    isPinned = () => false;
    needsRequest = () => false;
    async complete(raw) { return raw; }
    async timeline(_, page) { await this.beforeRequest(); return { items: page === 1 ? rawPosts : [], end: page >= 1, total: 137 }; }
    async close() {}
  }
  class OtherPlatform { constructor() { this.id = platform === 'weibo' ? 'xueqiu' : 'weibo'; this.name = platform === 'weibo' ? '雪球' : '微博'; } async close() {} }
  const factories = platform === 'weibo' ? { weibo: DemoPlatform, xueqiu: OtherPlatform } : { weibo: OtherPlatform, xueqiu: DemoPlatform };
  const runtime = createRuntime(directory, { updates: offlineUpdates(), adapterFactories: factories, getIM: () => im, avatarFetch: async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }) });
  const worker = runtime.sources[platform].worker; worker.now = () => clock;
  const server = createServer((req, res) => {
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    return runtime.handle(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(async () => { await browser.close(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const screen = async stage => {
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, stage + ' 横向溢出 ' + width);
      const clipped = await page.locator('.st-setting-control').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width && n.scrollWidth > n.clientWidth + 2).length);
      assert.equal(clipped, 0, stage + ' 控件溢出 ' + width);
      if (width === 390) {
        const labels = await page.locator('.st-nav > button,.st-follow-label').evaluateAll(nodes => nodes.map(n => ({ whiteSpace: getComputedStyle(n).whiteSpace, width: n.getBoundingClientRect().width })));
        assert.ok(labels.every(n => n.whiteSpace === 'nowrap' && n.width >= 48), stage + ' 导航文字应保持一行');
      }
      if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, `journey-${platform}-${stage}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  };
  const reader = async () => { await page.reload(); await page.getByRole('button', { name: '查看博主：' + author, exact: true }).click(); };
  const runJob = async kind => {
    const job = runtime.store.jobs().find(j => j.uid === key && j.kind === kind);
    for (let i = 0; i < 30; i++) {
      const current = runtime.store.job(job.id);
      if (current.status === 'complete' || current.last_success_at && kind === 'updates') return;
      clock = Math.max(clock, current.next_run_at, runtime.store.account(platform).next_request_at) + 1;
      await worker.tick(); clock += 30001;
    }
    assert.fail('任务未完成：' + kind);
  };
  const raw = (id, time, text, quote = null, images = false) => platform === 'weibo'
    ? { idstr: String(id), user: { idstr: externalUid, screen_name: author }, created_at: new Date(time).toISOString(), text_raw: text, pic_ids: images ? ['journey'] : [], pic_infos: images ? { journey: { large: { url: imageUrl } } } : {}, ...(quote ? { retweeted_status: quote } : {}) }
    : { id, user_id: Number(externalUid), user: { id: Number(externalUid), screen_name: author }, created_at: time, text, truncated: false, image_info_list: images ? [{ url: imageUrl }] : [], ...(quote ? { retweeted_status: quote } : {}) };
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('tab', { name, exact: true }).click();
  await screen('connect');
  await page.getByRole('region', { name: '信息保存位置', exact: true }).getByRole('button', { name: '确认保存位置', exact: true }).click();
  await page.getByRole('list', { name: '首次使用流程' }).locator('[aria-current=step]').filter({ hasText: '连接' + name }).waitFor();
  await page.getByRole('button', { name: '登录' + name, exact: true }).click();
  await page.getByRole('tab', { name: platform === 'weibo' ? '雪球' : '微博', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '我已登录，继续', exact: true }).count(), 0);
  await page.getByRole('tab', { name, exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '我已登录，继续', exact: true }).count(), 1, '切换平台不丢失独立授权窗口的确认入口');
  await page.getByRole('button', { name: '我已登录，继续', exact: true }).click();
  await page.getByRole('button', { name: '登录' + name, exact: true }).waitFor();
  assert.equal(logins, 1, '授权失败不自动重开浏览器');
  await page.getByRole('button', { name: '登录' + name, exact: true }).click();
  await page.getByRole('button', { name: '我已登录，继续', exact: true }).click();
  await page.getByRole('dialog', { name: '添加' + name + '博主', exact: true }).waitFor();
  await screen('add');
  await page.getByLabel(name + '博主主页或 UID', { exact: true }).fill('https://' + (platform === 'weibo' ? 'weibo.com' : 'www.xueqiu.com') + '/u/' + externalUid);
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('heading', { name: '从什么时候开始保存？', exact: true }).waitFor();
  assert.equal(logins, 2); assert.equal(runtime.store.target(key).capture_mode, 'pending');
  await screen('choice');
  await page.getByRole('button', { name: '从现在开始', exact: true }).click();
  await page.getByRole('region', { name: author + '保存进度', exact: true }).waitFor();
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: '监控流向', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '登录' + (platform === 'weibo' ? '雪球' : '微博'), exact: true }).count(), 0, '没有关注对象的平台不影响首页状态');
  await page.getByRole('main').getByRole('button', { name: '+ 添加博主', exact: true }).click();
  await page.getByRole('dialog', { name: '添加' + name + '博主', exact: true }).waitFor();
  await page.getByLabel(name + '博主主页或 UID', { exact: true }).fill('not-a-profile');
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  await page.getByLabel(name + '博主主页或 UID', { exact: true }).fill(externalUid);
  assert.equal(await page.getByRole('dialog').getByRole('alert').count(), 0, '修正输入后清除旧错误');
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('dialog').getByText('此博主已在关注列表中', { exact: true }).waitFor();
  assert.equal(runtime.store.targets().length, 1);
  await page.getByRole('tab', { name: platform === 'weibo' ? '雪球' : '微博', exact: true }).click();
  assert.equal(await page.getByRole('dialog').getByRole('alert').count(), 0, '切平台不保留上一平台的错误');
  await page.getByRole('button', { name: '关闭添加博主', exact: true }).click();
  const published = Date.now();
  rawPosts = [raw(1001, published, '原创消息：可以搜索验证', null, true), raw(1002, published, '转发点评', raw(999, published - 10000, '引用原文，默认折叠')), raw(1003, published - 2 * 86400000, '历史原创消息'), raw(1004, published - 2 * 86400000, '历史转发消息', raw(998, published - 3 * 86400000, '历史引用'))];
  if (platform === 'xueqiu') rawPosts.push({ ...raw(1005, published, '文章正文不应留存'), type: '3', title: '文章标题只保留链接' });
  await runJob('updates');
  assert.equal(runtime.store.count(), platform === 'xueqiu' ? 3 : 2);
  await runtime.documents.sync({ backgroundImages: false });
  await reader();
  await page.waitForFunction(() => document.querySelector('.st-image-grid img')?.naturalWidth > 0);
  assert.equal(await page.locator('article .st-quote[open]').count(), 0);
  if (platform === 'xueqiu') {
    assert.equal(await page.getByRole('link', { name: '文章标题只保留链接 ↗', exact: true }).count(), 1);
    assert.doesNotMatch(await page.locator('main').innerText(), /文章正文不应留存/);
    assert.equal(await page.locator('article').filter({ hasText: '文章标题只保留链接' }).getByRole('link').count(), 1, '文章卡片只保留一个原文链接');
  }
  await screen('reader');
  await page.getByRole('button', { name: '查看配图 1', exact: true }).click();
  await page.getByRole('button', { name: '关闭大图', exact: true }).click();
  await page.getByLabel('搜索留存正文').fill('搜索验证');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
  const exported = page.waitForEvent('download'); await page.getByRole('link', { name: '导出 Markdown', exact: true }).click();
  assert.match(readFileSync(await (await exported).path(), 'utf8'), /原创消息：可以搜索验证/);
  await page.getByLabel('搜索留存正文').fill('');
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  await page.getByLabel('缓存消息时间范围', { exact: true }).selectOption('month');
  await page.getByLabel('仅缓存原创（不含转发）', { exact: true }).check();
  await page.getByRole('button', { name: '应用筛选并缓存', exact: true }).click();
  await page.getByRole('button', { name: '暂停缓存', exact: true }).waitFor();
  await runJob('history');
  assert.equal(runtime.store.count(), platform === 'xueqiu' ? 4 : 3);
  assert.equal(runtime.store.posts().some(p => p.text === '历史转发消息'), false);
  await reader(); await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  await screen('history');
  for (let i = 0; i < 51; i++) runtime.store.savePost(worker.normalizePost(raw(3000 + i, published - 7 * 86400000 - i * 1000, '分页存档 ' + i), runtime.store.target(key)), Date.now(), 'history');
  await runtime.documents.sync({ backgroundImages: false });
  await reader();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 50);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length > 0 && document.querySelectorAll('article').length < 50);
  assert.match(await page.getByRole('navigation', { name: '内容翻页' }).innerText(), /第 2 页/);
  assert.equal(await page.getByRole('navigation', { name: '内容翻页' }).evaluate(n => getComputedStyle(n).justifyContent), 'flex-end');
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 50);
  await page.getByRole('button', { name: '返回博主列表', exact: true }).click();
  await screen('list');
  await page.getByRole('button', { name: '详细设置 →', exact: true }).click();
  await screen('frequency');
  const historyJob = runtime.store.jobs().find(j => j.uid === key && j.kind === 'history');
  runtime.store.updateJob(historyJob.id, { status: 'needs_review', message: '测试长文无法补齐，断点保留' });
  runtime.store.notice('attention', author + '：测试长文无法补齐', Date.now(), key);
  await page.reload();
  await page.locator('.st-flow-status.partial').waitFor();
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('tab', { name: platform === 'weibo' ? '微博' : '雪球', exact: true }).click();
  assert.match(await page.locator('#st-account').innerText(), /已登录/);
  assert.doesNotMatch(await page.locator('#st-account').innerText(), /任务需检查|历史缓存/);
  await page.getByRole('button', { name: '查看缓存问题', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '历史消息缓存', exact: true }).getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('.st-inline-error').innerText(), new RegExp(author));
  await page.getByRole('button', { name: /^消息中心/ }).click();
  await page.locator('.st-message-row').filter({ hasText: '测试长文无法补齐' }).getByRole('button', { name: '去处理', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '历史消息缓存', exact: true }).getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('.st-inline-error').innerText(), new RegExp(author));
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '重试历史缓存', exact: true }).count(), 0);
  await page.getByRole('tab', { name: '历史消息缓存', exact: true }).click();
  await page.getByRole('button', { name: '重试历史缓存', exact: true }).click();
  assert.equal(runtime.store.job(historyJob.id).status, 'queued');
  if (platform === 'weibo') {
    const pending = { idstr: '940000000000001', isLongText: true, text: '这条微博只返回了开头片段', user: { idstr: externalUid, screen_name: author }, created_at: new Date().toISOString() };
    const issue = { type: 'full_text', rootId: pending.idstr, postId: pending.idstr, stage: '微博正文', url: 'https://weibo.com/detail/' + pending.idstr, excerpt: pending.text, attempts: 1, maxAttempts: 3, nextRetryAt: Date.now() + 60000, exhausted: false };
    runtime.store.updateJob(historyJob.id, { checkpoint: { pageLoaded: true, page: 1, pending: [pending], contentIssue: issue } });
    await page.reload();
    await page.getByRole('button', { name: '正在恢复缓存 · 无需操作', exact: true }).click();
    await page.getByRole('status', { name: '未读完整的内容', exact: true }).waitFor();
    assert.match(await page.getByRole('status').filter({ hasText: '正在自动恢复，无需操作' }).innerText(), /这条微博只返回了开头片段/);
    assert.equal(await page.getByRole('button', { name: '重试历史缓存', exact: true }).count(), 0);
    runtime.store.updateJob(historyJob.id, { status: 'needs_review', checkpoint: { pageLoaded: true, page: 1, pending: [pending], contentIssue: { ...issue, attempts: 3, exhausted: true, nextRetryAt: null } } });
    await page.reload();
    await page.locator('button.st-flow-status').click();
    await page.getByRole('button', { name: '跳过这条，继续缓存', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '查看这条微博 ↗', exact: true }).getAttribute('href'), issue.url);
    assert.equal(await page.getByRole('button', { name: '继续缓存', exact: true }).count(), 0, '不重复提供含义不清的继续按钮');
    await page.getByRole('button', { name: '跳过这条，继续缓存', exact: true }).click();
    await page.getByText(/已保留片段和链接，继续缓存其他内容/).waitFor();
    assert.equal(runtime.store.posts({ ids: [pending.idstr] })[0].complete, 0);
    assert.equal(runtime.store.job(historyJob.id).status, 'queued');
  }
  await page.getByRole('button', { name: /^消息中心/ }).click();
  await screen('messages');
  await page.locator('.st-message-row').filter({ hasText: '原创消息：可以搜索验证' }).getByRole('button', { name: '查看', exact: true }).click();
  await page.getByText('提醒对应的动态', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
  assert.match(await page.locator('article').innerText(), /原创消息：可以搜索验证/);
  assert.doesNotMatch(await page.locator('article').innerText(), /转发点评|文章标题只保留链接/);
  await page.getByRole('button', { name: '查看这位博主的全部内容', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length >= 3);
  await page.getByRole('button', { name: /^消息中心/ }).click();
  await page.getByRole('button', { name: '全部标为已读', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.st-message-row.unread'));
  assert.equal(runtime.store.unreadNotices().all, 0);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await screen('flow');
  await page.getByRole('button', { name: '设置 Social Trace Agent', exact: true }).click();
  await page.getByRole('tab', { name: '添加渠道', exact: true }).click();
  await page.getByLabel('推送机器人', { exact: true }).selectOption('mock-bot');
  await page.getByLabel('推送接收目标', { exact: true }).selectOption('mock-chat');
  await page.getByRole('button', { name: '保存接收目标', exact: true }).click();
  await page.getByLabel('自动推送新动态', { exact: true }).check();
  await page.getByRole('tab', { name: '添加渠道', exact: true }).click();
  await page.getByLabel('推送机器人', { exact: true }).selectOption('qq-bot');
  await page.getByLabel('推送接收目标', { exact: true }).selectOption('qq-chat');
  await page.getByRole('button', { name: '保存接收目标', exact: true }).click();
  await page.getByRole('switch', { name: '推送目标2开关', exact: true }).waitFor();
  assert.equal(runtime.store.getSetting('agentDelivery').destinations.length, 2);
  await page.getByRole('switch', { name: '推送目标2开关', exact: true }).uncheck();
  await page.waitForFunction(() => !document.querySelector('[aria-label="推送目标2开关"]')?.checked);
  await page.getByRole('switch', { name: '推送目标2开关', exact: true }).check();
  await screen('agent');
  assert.equal(runtime.store.getSetting('agentDelivery').enabled, true);
  const nextPost = worker.normalizePost(raw(2000, Date.now() + 1000, '后续新动态推送验证'), runtime.store.target(key));
  runtime.store.savePost(nextPost, Date.now(), 'updates', Date.now());
  await runtime.agent.tick(); await runtime.agent.tick();
  assert.equal(deliveries.length, 2); assert.match(deliveries[0][2], /后续新动态推送验证/);
  assert.deepEqual(new Set(deliveries.map(item => item[0])), new Set(['mock-bot', 'qq-bot']));
  await page.getByRole('tab', { name: '投递记录', exact: true }).click();
  await page.getByRole('button', { name: '关闭 Agent 设置', exact: true }).click();
  await page.reload();
  await page.locator('[data-flow-edge="im"]').waitFor();
  assert.match(await page.locator('.st-im-node').innerText(), /QQ/);
  assert.match(await page.getByRole('button', { name: '查看 dsh-im QQ配置', exact: true }).innerText(), /QQ/);
  await screen('flow-connected');
  await page.getByRole('button', { name: '查看 dsh-im QQ配置', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '已添加渠道', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByLabel('推送机器人', { exact: true }).count(), 0, '已添加页不显示添加表单');
  let holdNext = true, heldRoute, heldResponse, captured;
  const capture = new Promise(resolve => { captured = resolve; });
  const statusPattern = '**/dsh-social-trace/status';
  await page.route(statusPattern, async route => {
    if (!holdNext) return route.continue();
    holdNext = false;
    heldRoute = route;
    heldResponse = await route.fetch();
    captured();
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await capture;
  await page.getByRole('button', { name: '移除推送目标1', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.st-destination-row').length === 1);
  const oldResponseDone = page.waitForEvent('requestfinished', request => request === heldRoute.request());
  await heldRoute.fulfill({ response: heldResponse });
  await oldResponseDone;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.st-destination-row').count(), 1, '删除前发起的旧轮询不能恢复已删除的微信');
  await page.unroute(statusPattern);
  await page.getByRole('button', { name: '关闭 Agent 设置', exact: true }).click();
  assert.doesNotMatch(await page.locator('.st-im-node').innerText(), /微信/);
  assert.equal(await page.getByRole('button', { name: '查看 dsh-im 微信配置', exact: true }).count(), 0);
  const dotLeft = await page.getByRole('button', { name: '查看 dsh-im QQ配置', exact: true }).locator('.st-dot').evaluate(node => node.getBoundingClientRect().left);
  const platformDotLeft = await page.locator('.st-sidebar-account').filter({ hasText: name + ' ·' }).first().locator('.st-dot').evaluate(node => node.getBoundingClientRect().left);
  assert.ok(Math.abs(dotLeft - platformDotLeft) < 1, 'IM 状态点与平台状态点对齐');
  assert.equal(await page.getByRole('button', { name: '查看 dsh-im QQ配置', exact: true }).evaluate(node => getComputedStyle(node).fontSize),
    await page.locator('.st-sidebar-account').filter({ hasText: name + ' ·' }).first().evaluate(node => getComputedStyle(node).fontSize), 'IM 状态与平台状态字号一致');
  await screen('qq-only');
  runtime.store.notice('attention', author + '：推送未确认，请查看投递记录', Date.now(), key);
  await page.reload();
  await page.getByRole('button', { name: /^消息中心/ }).click();
  await page.locator('.st-message-row').filter({ hasText: '推送未确认' }).getByRole('button', { name: '去处理', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: '投递记录', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: '关闭 Agent 设置', exact: true }).click();
  const other = platform === 'weibo' ? 'xueqiu' : 'weibo';
  runtime.store.addTarget('7777777777', '另一个平台待连接作者', Date.now(), other, { captureMode: 'pending', archiveHistory: false });
  await page.reload();
  await page.locator('.st-flow-status.partial').waitFor();
  await page.getByRole('button', { name: '查看异常', exact: true }).click();
  await page.getByRole('region', { name: (other === 'weibo' ? '微博' : '雪球') + '账号连接', exact: true }).waitFor();
  runtime.store.setSetting('platformEnabled:' + other, false);
  runtime.store.setAccount({ status: 'needs_verification', reason: name + '需要验证' }, platform, true);
  await page.reload();
  await page.getByRole('button', { name: '完成验证', exact: true }).click();
  await page.getByRole('region', { name: name + '账号连接', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('业务 Chat：总结、查询、确认监控变更、创建并执行任务，页面状态同步且窄屏可用', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-chat-ui-'));
  const uid = '1234567890', selection = { provider: 'fixture', model: 'fixture-model' };
  let releaseFirst; const firstRequest = new Promise(resolve => { releaseFirst = resolve; }); let firstCall = true;
  const model = { available: () => true, selection: () => selection, generate: async options => {
    if (firstCall) { firstCall = false; options.onPhase?.('thinking'); await firstRequest; }
    const input = JSON.parse(options.messages.findLast(item => item.role === 'user' && item.content[0].text.startsWith('{')).content[0].text).request;
    if (input === '触发回答截断测试' || input === '继续刚才未完成的回答，从中断处接着写') {
      const truncated = input === '触发回答截断测试', text = truncated ? '尚未完成的观点说明。' : '续写已补全。';
      return { text, calls: [], content: [{ type: 'text', text }], source: { kind: 'model', ...selection }, truncated };
    }
    if (input === '批量开启两位博主历史缓存') {
      const calls = [uid, '1234567891'].map((id, index) => ({ id: 'batch-' + index, type: 'tool-call', name: 'control_monitor', arguments: JSON.stringify({ uid: id, kind: 'history', enabled: true }) }));
      return { text: '', calls, content: calls, source: { kind: 'model', ...selection } };
    }
    let text = '', calls = [];
    if (options.messages.at(-1).role === 'tool') text = input.includes('总结') ? '## 今日观点\n\n测试博主今天表达了一个观点 [S1]\n\n- **核心结论**：保持观察\n- 使用 `本地资料` 核对\n\n| 博主 | 消息 |\n| --- | --- |\n| 测试博主 | 1 |\n\n<script>window.chatInjected=true</script>\n\n[危险链接](javascript:alert(1))' : '已查询：测试博主已加入关注，账号已连接。';
    else {
      let name, args;
      if (input.startsWith('创建')) { name = 'create_summary_task'; args = { name: '工作日总结', uids: [uid], times: ['12:00', '18:00'] }; }
      else if (input.includes('暂停')) { name = 'control_monitor'; args = { uid, kind: 'updates', enabled: false }; }
      else if (input.includes('总结')) { name = 'search_posts'; args = { uids: [uid] }; }
      else { name = 'list_status'; args = {}; }
      calls = [{ id: 'call', type: 'tool-call', name, arguments: JSON.stringify(args) }];
    }
    return { text, calls, content: [...calls, ...(text ? [{ type: 'text', text }] : [])], source: { kind: 'model', ...selection } };
  } };
  const runtime = createRuntime(directory, { model, updates: offlineUpdates() });
  runtime.store.addTarget(uid, '测试博主', Date.now() - 100000, 'weibo', { archiveHistory: false, captureMode: 'from_now' });
  runtime.store.setAccount({ status: 'ready' });
  runtime.store.savePost(normalizePost({ idstr: '10001', user: { idstr: uid, screen_name: '测试博主' }, text: '真实观点', created_at: new Date().toISOString() }, uid));
  let delaySendResponse = false, releaseSendResponse, onSendHeld;
  const server = createServer((req, res) => {
    if (delaySendResponse && req.url === '/dsh-social-trace/chat/message') { delaySendResponse = false; const end = res.end.bind(res); res.end = (...args) => { releaseSendResponse = () => end(...args); onSendHeld?.(); return res; }; }
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    return runtime.handle(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(async () => { await browser.close(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByRole('region', { name: 'Social Trace 业务 Chat' }).waitFor().catch(async error => { throw new Error(JSON.stringify(errors) + '\n' + await page.locator('body').innerText() + '\n' + error.message); });
  assert.equal(await page.getByRole('region', { name: '历史对话' }).count(), 1);
  assert.equal(await page.locator('.st-chat.is-empty').count(), 1);
  assert.equal(await page.getByRole('button', { name: '新建对话', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal(await page.getByRole('button', { name: 'Chat', exact: true }).count(), 0, '对话页不保留重复 Chat 入口');
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'business-chat-welcome.png'), fullPage: true });
  const send = async input => {
    await page.getByRole('textbox', { name: '告诉 Social Trace 你想做什么' }).fill(input);
    await page.getByRole('button', { name: '发送', exact: true }).click();
  };
  const composer = page.getByRole('textbox', { name: '告诉 Social Trace 你想做什么' });
  await composer.fill('中文输入');
  await composer.dispatchEvent('compositionstart');
  await composer.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  assert.equal(runtime.chat.sessions().length, 0, '输入法确认不能发送消息');
  await composer.dispatchEvent('compositionend');
  await composer.press('Shift+Enter');
  assert.match(await composer.inputValue(), /\n/);
  assert.equal(runtime.chat.sessions().length, 0, 'Shift+Enter 只换行');
  await composer.fill('总结今天测试博主的观点'); await composer.press('Enter');
  await page.getByRole('list', { name: '最近处理步骤' }).getByText('模型正在思考', { exact: true }).waitFor();
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'chat-live-progress.png'), fullPage: true });
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.locator('.st-chat.is-empty').waitFor();
  assert.equal(await composer.inputValue(), '');
  await composer.fill('不应串到上一条的草稿');
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  assert.equal(await composer.inputValue(), '', '重复新建也必须重置草稿');
  await page.getByRole('region', { name: '历史对话' }).getByRole('button', { name: '总结今天测试博主的观点', exact: true }).click();
  releaseFirst();
  await page.getByText('测试博主今天表达了一个观点 [S1]', { exact: true }).waitFor();
  assert.equal(await page.locator('.st-chat-source-list a').count(), 1);
  assert.equal(await page.locator('.st-chat-answer h2').first().innerText(), '今日观点');
  assert.equal(await page.locator('.st-chat-answer strong').first().innerText(), '核心结论');
  assert.equal(await page.locator('.st-chat-answer table tbody tr').count(), 1);
  assert.equal(await page.locator('.st-chat-answer script, .st-chat-answer a[href^="javascript:"]').count(), 0);
  assert.equal(await page.evaluate(() => window.chatInjected), undefined);
  assert.equal(await page.locator('.st-chat-source-list').first().getAttribute('open'), null);
  assert.equal(await page.locator('.st-chat-trace').first().getAttribute('open'), null);
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'chat-readable-answer.png'), fullPage: true });
  const savedRun = runtime.chat.runs(runtime.chat.sessions()[0].id)[0];
  const longAnswer = '## 长对话布局验证\n\n' + Array.from({ length: 90 }, (_, index) => '第 ' + index + ' 段：用于检查长回答滚动时标题和输入区固定。').join('\n\n');
  runtime.store.db.prepare('UPDATE chat_runs SET answer=? WHERE id=?').run(longAnswer, savedRun.id);
  await page.getByRole('heading', { name: '长对话布局验证', exact: true }).waitFor({ state: 'attached' });
  const chatScroll = page.getByRole('region', { name: '消息内容', exact: true });
  const bounds = () => page.evaluate(() => ({ header: document.querySelector('.st-chat-toolbar').getBoundingClientRect().top, dock: document.querySelector('.st-chat-dock').getBoundingClientRect().bottom, mainScroll: document.querySelector('.st-main').scrollTop }));
  const beforeScroll = await bounds();
  await chatScroll.evaluate(node => { node.scrollTop = node.scrollHeight / 2; node.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await page.getByRole('button', { name: '回到最新消息 ↓', exact: true }).waitFor();
  const readingAt = await chatScroll.evaluate(node => node.scrollTop);
  runtime.store.db.prepare('UPDATE chat_runs SET answer=? WHERE id=?').run(longAnswer + '\n\n追加内容', savedRun.id);
  await page.waitForFunction(() => document.querySelector('.st-chat-answer')?.textContent.includes('追加内容'));
  assert.ok(Math.abs(await chatScroll.evaluate(node => node.scrollTop) - readingAt) < 2, '更新不能抢走用户上翻阅读位置');
  await page.getByRole('button', { name: '回到最新消息 ↓', exact: true }).click();
  const afterScroll = await bounds();
  assert.equal(afterScroll.header, beforeScroll.header, '长文滚动后标题栏位置不动');
  assert.equal(afterScroll.dock, beforeScroll.dock, '长文滚动后输入区位置不动');
  assert.equal(afterScroll.mainScroll, 0, '主页面本身不能随消息滚动');
  assert.equal(await page.locator('.st-aside > button').first().innerText(), '新建对话');
  if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'chat-fixed-shell.png'), fullPage: true });
  runtime.store.db.prepare('UPDATE chat_runs SET answer=? WHERE id=?').run(savedRun.answer, savedRun.id);


  await send('查询监控状态');
  await page.getByText('已查询：测试博主已加入关注，账号已连接。', { exact: true }).waitFor();
  await send('暂停测试博主的新动态监控');
  await page.getByRole('button', { name: '确认执行', exact: true }).waitFor();
  const job = runtime.store.jobs().find(job => job.kind === 'updates');
  assert.equal(job.status, 'queued');
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.getByText(/已执行：测试博主：暂停新动态监控/).waitFor();
  assert.equal(runtime.store.job(job.id).status, 'paused');
  runtime.store.addTarget('1234567891', '第二位测试博主');
  for (const item of runtime.store.jobs().filter(item => item.kind === 'history')) runtime.store.updateJob(item.id, { status: 'paused' });
  await send('批量开启两位博主历史缓存');
  const preview = page.getByLabel('待确认的业务变更');
  await preview.waitFor();
  assert.equal(await preview.locator('li').count(), 2, '两个博主必须同时出现在确认清单里');
  assert.match(await preview.innerText(), /第二位测试博主/);
  assert.ok(runtime.store.jobs().filter(item => item.kind === 'history').every(item => item.status === 'paused'));
  await preview.getByRole('button', { name: '确认执行', exact: true }).click();
  await preview.waitFor({ state: 'detached' });
  assert.ok(runtime.store.jobs().filter(item => item.kind === 'history').every(item => item.status === 'queued'));
  await send('创建工作日总结任务');
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^定时任务/ }).count(), 0, '标题栏移除定时任务入口');
  const task = runtime.chat.tasks()[0]; assert.deepEqual(task.times, ['12:00', '18:00']);
  runtime.store.db.prepare('UPDATE chat_tasks SET next_run_at=? WHERE id=?').run(Date.now() - 1000, task.id);
  runtime.chat.tick(); await runtime.chat.work;
  await page.getByRole('region', { name: '历史对话' }).getByRole('button', { name: task.name, exact: true }).click();
  await page.getByText('测试博主今天表达了一个观点 [S1]', { exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Chat 不应横向溢出');
    if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'business-chat-' + width + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload(); await page.getByRole('region', { name: '历史对话' }).getByRole('button', { name: '总结今天测试博主的观点', exact: true }).click();
  await page.getByText('测试博主今天表达了一个观点 [S1]', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const oldCount = runtime.chat.sessions().length;
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.locator('.st-chat.is-empty').waitFor();
  await composer.fill('查询监控状态');
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.st-chat-send')?.disabled);
  await composer.press('Enter');
  await page.getByText('已查询：测试博主已加入关注，账号已连接。', { exact: true }).waitFor();
  assert.equal(runtime.chat.sessions().length, oldCount + 1, '回车首条消息真正创建独立会话');
  assert.equal(await page.locator('.st-chat-question').count(), 1, '新对话不能带入历史问题');
  await composer.fill('当前会话草稿');
  await page.getByRole('region', { name: '历史对话' }).getByRole('button', { name: '总结今天测试博主的观点', exact: true }).click();
  assert.equal(await composer.inputValue(), '', '切换历史不能串草稿');
  await page.getByRole('region', { name: '历史对话' }).getByRole('button', { name: '查询监控状态', exact: true }).click();
  assert.equal(await composer.inputValue(), '当前会话草稿', '返回会话恢复自己的草稿');
  assert.deepEqual(await page.getByRole('navigation', { name: 'Social Trace 导航', exact: true }).locator(':scope > button, :scope > details > summary').allTextContents(), ['监控流向', '关注与档案', '消息中心' + (await page.locator('.st-nav-badge').innerText().catch(() => ''))]);
  delaySendResponse = true;
  const held = new Promise(resolve => { onSendHeld = resolve; });
  await composer.fill('请求延迟回归');
  await page.waitForFunction(() => !document.querySelector('.st-chat-send')?.disabled);
  await composer.press('Enter'); await held;
  await page.waitForFunction(() => document.querySelector('.st-chat-send')?.disabled);
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.locator('.st-chat.is-empty').waitFor();
  await composer.fill('留在新对话');
  const delayedResponse = page.waitForResponse(response => response.url().endsWith('/chat/message'));
  assert.equal(typeof releaseSendResponse, 'function'); releaseSendResponse(); await delayedResponse;
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '留在新对话', '旧请求返回不能清空新会话草稿');
  assert.equal(await page.locator('.st-chat-question').count(), 0, '旧请求返回不能抢回选中的新对话');
  const history = page.getByRole('region', { name: '历史对话' });
  const row = history.locator('.st-chat-history-row').filter({ has: page.getByRole('button', { name: '总结今天测试博主的观点', exact: true }) });
  await row.hover();
  await row.getByRole('button', { name: '删除对话：总结今天测试博主的观点', exact: true }).click();
  await page.getByRole('button', { name: '撤销删除', exact: true }).waitFor();
  assert.equal(await history.getByRole('button', { name: '总结今天测试博主的观点', exact: true }).count(), 0);
  await page.getByRole('button', { name: '撤销删除', exact: true }).click();
  await history.getByRole('button', { name: '总结今天测试博主的观点', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^定时任务/ }).count(), 0);
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await send('触发回答截断测试');
  await page.getByRole('button', { name: '继续回答', exact: true }).waitFor();
  assert.match(await page.locator('.st-chat-progress-head').last().innerText(), /回答未完/);
  assert.doesNotMatch(await page.locator('.st-chat-progress-head').last().innerText(), /执行失败/);
  await composer.fill('尚未发送的草稿');
  await page.getByRole('button', { name: '继续回答', exact: true }).click();
  await page.getByText('续写已补全。', { exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '尚未发送的草稿', '继续回答不能丢失正在编辑的草稿');
  assert.deepEqual(errors, []);
});


test('抖音页面：独立登录添加、每天多时间配置、视频与转写开关和资料展示', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-douyin-ui-'));
  writeFileSync(join(directory, 'workspace.json'), JSON.stringify({ directory }));
  const runtime = createRuntime(directory, { updates: offlineUpdates() });
  const external = 'MS4w' + 'C'.repeat(40), uid = 'douyin:' + external;
  let loginCount = 0;
  runtime.sources.douyin.browser.login = async () => { loginCount++; };
  runtime.sources.douyin.browser.checkLogin = async () => 'SYNTHETIC_ACCOUNT';
  runtime.sources.douyin.browser.profile = async () => ({ name: '抖音页面测试博主', avatar: null, total: 3 });
  const server = createServer((req, res) => {
    if (assets[req.url]) { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(assets[req.url]); }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(shell); }
    return runtime.handle(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  t.after(async () => { await browser.close(); server.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '连接与设置', exact: true }).waitFor().catch(async error => { throw new Error(JSON.stringify(errors) + '\n' + (await page.locator('body').innerText()).slice(0, 1200) + '\n' + error.message); });
  await page.getByRole('button', { name: '连接与设置', exact: true }).click();
  await page.getByRole('tab', { name: '抖音', exact: true }).click();
  await page.getByRole('button', { name: '登录抖音', exact: true }).click();
  await page.getByRole('button', { name: '我已登录，继续', exact: true }).click();
  assert.equal(loginCount, 1);
  await page.getByRole('button', { name: '关闭添加博主', exact: true }).click();
  await page.getByLabel('抖音检查时间 1', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: '+ 添加检查时间', exact: true }).click();
  await page.getByLabel('抖音检查时间 2', { exact: true }).fill('20:00');
  await page.getByRole('switch', { name: '保存视频', exact: true }).check();
  await page.getByRole('switch', { name: '本地转写', exact: true }).check();
  await page.getByRole('button', { name: '保存抖音配置', exact: true }).click();
  await page.getByText('抖音配置已保存', { exact: true }).waitFor();
  assert.deepEqual(runtime.store.getSetting('douyinConfig').times, ['10:00', '20:00']);
  assert.equal(runtime.store.getSetting('douyinConfig').saveVideo, true);
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.locator('.st-follow-menu > summary').click();
  await page.getByRole('button', { name: '+ 添加博主', exact: true }).first().click();
  await page.getByRole('tab', { name: '抖音', exact: true }).last().click();
  await page.getByRole('textbox', { name: '抖音博主主页或 UID', exact: true }).fill('https://www.douyin.com/user/' + external);
  await page.getByRole('button', { name: '添加并读取资料', exact: true }).click();
  await page.getByRole('button', { name: '从现在开始', exact: true }).waitFor();
  await page.getByRole('button', { name: '从现在开始', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.st-capture-choice'));
  assert.equal(runtime.store.target(uid).capture_mode, 'from_now');
  const post = normalizeDouyinPost({ aweme_id: '92000000000000001', create_time: Math.floor(Date.now() / 1000), author: { sec_uid: external, nickname: '抖音页面测试博主' }, desc: '视频说明', video: { duration: 60000 }, chapter_review_status: 2, chapter_abstract: '平台AI归纳内容', chapter_list: [{ timestamp: 30000, desc: '章节一', detail: '章节测试内容' }] }, external);
  runtime.store.savePost({ ...post, uid, id: 'douyin:' + post.id }, Date.now(), 'updates');
  runtime.videos.patch('douyin:' + post.id, { transcript: '本地语音识别测试内容', transcript_status: 'done' });
  await page.getByRole('button', { name: '监控流向', exact: true }).click();
  await page.getByRole('button', { name: '设置抖音平台', exact: true }).click();
  await page.getByRole('tab', { name: '内容保存', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: '保存视频', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: '关闭监控设置', exact: true }).click();
  await page.locator('.st-follow-menu > summary').click();
  await page.getByRole('button', { name: /抖音页面测试博主/ }).first().click().catch(async error => { throw new Error((await page.locator('body').innerText()).slice(0, 3500) + '\n' + error.message); });
  assert.ok((await page.locator('.st-identity .st-uid-tag').innerText()).length < 30, '长UID应缩略显示');
  assert.equal(await page.locator('.st-identity .st-uid-tag').getAttribute('title'), 'UID ' + external);
  await page.getByRole('tab', { name: '新消息监控', exact: true }).click();
  assert.equal(await page.getByLabel('抖音检查时间 1', { exact: true }).isEnabled(), true, '跟随平台的博主也应能直接修改时间');
  await page.getByLabel('抖音检查时间 1', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: '保存抖音配置', exact: true }).click();
  await page.getByText('抖音配置已保存', { exact: true }).waitFor();
  assert.deepEqual(runtime.store.getSetting('douyinConfig:' + uid).times, ['11:00', '20:00']);
  assert.deepEqual(runtime.store.getSetting('douyinConfig').times, ['10:00', '20:00'], '博主编辑不改变平台默认');
  await page.getByRole('tab', { name: '内容保存', exact: true }).click();
  await page.getByRole('switch', { name: '本地转写', exact: true }).uncheck();
  await page.getByRole('button', { name: '保存抖音配置', exact: true }).click();
  await page.getByText('抖音配置已保存', { exact: true }).waitFor();
  assert.deepEqual(runtime.store.getSetting('douyinConfig:' + uid).times, ['11:00', '20:00'], '保存内容选项保留独立时间');
  await page.getByRole('tab', { name: '留存内容', exact: true }).click();
  await page.getByText('平台AI归纳内容', { exact: true }).waitFor();
  await page.getByText('本地文字稿 · 已生成', { exact: true }).click();
  await page.getByText('本地语音识别测试内容', { exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '抖音资料页不能横向溢出');
    if (process.env.SOCIAL_TRACE_UI_OUTPUT) await page.screenshot({ path: join(process.env.SOCIAL_TRACE_UI_OUTPUT, 'douyin-content-' + width + '.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
});
