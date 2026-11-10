import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createRuntime } from '../lib/index.js';
import { normalizePost } from '../lib/platforms/weibo/index.js';

async function server(t, options) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-routes-'));
  const runtime = createRuntime(directory, options);
  // Route tests do not start real account collection.
  const http = createServer(runtime.handle);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const base = `http://127.0.0.1:${http.address().port}/dsh-social-trace`;
  t.after(async () => { http.close(); await runtime.close(); rmSync(directory, { recursive: true }); });
  return { runtime, base };
}
const headers = { 'Content-Type': 'application/json', 'X-Social-Trace': '1' };

test('已删除对话的报告不能再通过运行 ID 定位，恢复后可访问', async t => {
  const { runtime, base } = await server(t);
  const session = runtime.chat.newSession('报告');
  runtime.store.db.prepare("INSERT INTO chat_runs(id,session_id,input,status,created_at) VALUES(?,?,?,'completed',?)").run('fixture-run', session, '测试', Date.now());
  assert.equal((await fetch(base + '/chat/run?id=fixture-run')).status, 200);
  await runtime.chat.deleteSession(session);
  assert.equal((await fetch(base + '/chat/run?id=fixture-run')).status, 404);
  runtime.chat.restoreSession(session);
  assert.equal((await fetch(base + '/chat/run?id=fixture-run')).status, 200);
});

for (const scope of ['总控', '平台', '博主', '新动态', '历史缓存', '批量历史缓存', '账号']) {
  test(`真实 HTTP 关闭入口：${scope}在全文请求中关闭后不继续入库`, async t => {
    const { runtime, base } = await server(t), uid = '1234567890';
    runtime.store.addTarget(uid, '测试博主', Date.now() - 10000); runtime.store.setAccount({ status: 'ready' });
    const kind = scope === '新动态' ? 'updates' : 'history';
    const job = runtime.store.jobs().find(j => j.kind === kind);
    for (const other of runtime.store.jobs().filter(j => j.id !== job.id)) runtime.store.updateJob(other.id, { status: 'paused' });
    const raw = { idstr: '10000000000000001', user: { idstr: uid, screen_name: '测试博主' }, text: '测试全文', created_at: new Date().toISOString() };
    runtime.store.updateJob(job.id, { checkpoint: { page: 1, pageLoaded: true, pending: [raw] } });
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    runtime.browser.complete = async () => { await runtime.worker.beforeRequest(); entered(); return new Promise(resolve => { release = resolve; }); };
    const task = runtime.worker.tick(); await started;
    const endpoint = scope === '新动态' ? `/jobs/${job.id}/pause` : ['历史缓存', '批量历史缓存'].includes(scope) ? '/history/pause' : scope === '账号' ? '/account/pause' : '/monitoring';
    const body = scope === '总控' ? { scope: 'all', enabled: false } : scope === '平台' ? { scope: 'platform', platform: 'weibo', enabled: false } : scope === '博主' ? { scope: 'target', uid, enabled: false } : scope === '历史缓存' ? { uid } : scope === '批量历史缓存' ? { scope: 'platform' } : {};
    try { assert.equal((await fetch(base + endpoint, { method: 'POST', headers, body: JSON.stringify(body) })).status, 200); }
    finally { release(raw); await task; }
    assert.equal(runtime.store.count(), 0);
    assert.deepEqual(runtime.store.job(job.id).checkpoint.pending, [raw]);
    assert.equal(runtime.store.job(job.id).saved, 0);
  });
}

test('拒绝跨站请求与缺少操作标记的写入；状态接口不包含 Cookie 或待保存原始数据', async t => {
  const { runtime, base } = await server(t);
  const without = await fetch(base + '/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"1234567890"}' });
  assert.equal(without.status, 403);
  const cross = await fetch(base + '/targets', { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: '{"url":"1234567890"}' });
  assert.equal(cross.status, 403);
  assert.equal(runtime.store.targets().length, 0);
  const response = await fetch(base + '/status');
  const state = await response.json();
  assert.equal(state.account.status, 'needs_login');
  assert.equal(JSON.stringify(state).includes('cookies'), false);
});

test('添加、暂停与恢复任务通过真实 HTTP 接口持久化；无账号时不会采集', async t => {
  const { runtime, base } = await server(t);
  const added = await fetch(base + '/targets', { method: 'POST', headers, body: '{"url":"1234567890"}' });
  assert.equal(added.status, 200);
  const duplicate = await fetch(base + '/targets', { method: 'POST', headers, body: '{"url":"1234567890"}' });
  assert.equal(duplicate.status, 409);
  runtime.store.db.prepare("UPDATE targets SET capture_mode='active' WHERE uid='1234567890'").run();
  const job = runtime.store.jobs()[0];
  for (const [action, status] of [['pause', 'paused'], ['resume', 'queued']]) {
    const response = await fetch(`${base}/jobs/${job.id}/${action}`, { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 200);
    assert.equal(runtime.store.job(job.id).status, status);
  }
  await runtime.worker.tick();
  assert.equal(runtime.store.count(), 0);
  assert.equal(runtime.browser.context, null);
});

test('中文搜索与导出读取真实本地档案；浏览器脚本只能作为文字返回', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  runtime.store.savePost(normalizePost({ idstr: '10000000000000001', user: { idstr: '1234567890', screen_name: '归档测试' },
    text: '历史正文 &lt;script&gt;alert(1)&lt;/script&gt;', created_at: '2026-11-04T10:00:00Z' }, '1234567890'));
  const result = await (await fetch(base + '/posts?q=' + encodeURIComponent('历史'))).json();
  assert.equal(result.items.length, 1);
  const response = await fetch(base + '/export?format=md');
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.match(await response.text(), /历史正文/);
  const jsonl = await (await fetch(base + '/export?format=jsonl')).text();
  assert.equal(JSON.parse(jsonl.trim()).author, '归档测试');
});

test('流向图的每位博主数量和最后写入时间来自真实档案统计', async t => {
  const { runtime, base } = await server(t);
  for (const uid of ['1234567890', '1234567891']) runtime.store.addTarget(uid);
  for (let i = 0; i < 3; i++) {
    const uid = i === 0 ? '1234567890' : '1234567891';
    runtime.store.savePost(normalizePost({ idstr: '1000000000000000' + i,
      user: { idstr: uid, screen_name: '测试作者' }, text: '真实档案统计', created_at: '2026-11-04T10:00:00Z' }, uid), 1000 + i);
  }
  const state = await (await fetch(base + '/status')).json();
  assert.equal(state.count, 3);
  assert.deepEqual(state.archiveSummary, [
    { uid: '1234567890', count: 1, original_count: 1, repost_count: 0, last_saved_at: 1000 },
    { uid: '1234567891', count: 2, original_count: 2, repost_count: 0, last_saved_at: 1002 },
  ]);
  assert.equal(state.activeJobId, null);
});

test('资料库被占用时状态接口仍返回 JSON，释放占用后可重试启动', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-lease-'));
  const owner = createRuntime(directory); owner.start();
  const other = createRuntime(directory); other.start();
  const http = createServer(other.handle); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const base = `http://127.0.0.1:${http.address().port}/dsh-social-trace`;
  t.after(async () => { http.close(); await owner.close(); await other.close(); rmSync(directory, { recursive: true }); });
  const state = await (await fetch(base + '/status')).json();
  assert.equal(state.stopped, true);
  assert.match(state.serviceError, /另一个 Social Trace/);
  const blocked = await fetch(base + '/targets', { method: 'POST', headers, body: '{"url":"1234567890"}' });
  assert.equal(blocked.status, 503);
  assert.match((await blocked.json()).error, /另一个 Social Trace/);
  await owner.close();
  const retried = await fetch(base + '/service/retry', { method: 'POST', headers, body: '{}' });
  assert.equal(retried.status, 200);
  const resumed = await (await fetch(base + '/status')).json();
  assert.equal(resumed.stopped, false);
  assert.equal(resumed.serviceError, '');
});

test('三级监控开关持久化且互不覆盖；重新开启不解除账号验证和冷却', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  const set = async body => {
    const response = await fetch(base + '/monitoring', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
  };
  await set({ scope: 'target', uid: '1234567890', enabled: false });
  await set({ scope: 'platform', platform: 'weibo', enabled: false });
  await set({ scope: 'all', enabled: false });
  await set({ scope: 'all', enabled: true });
  let state = await (await fetch(base + '/status')).json();
  assert.equal(state.enabled, true);
  assert.equal(state.platforms.find(source => source.id === 'weibo').enabled, false);
  assert.equal(state.targets[0].enabled, false);
  assert.equal(state.account.status, 'needs_login');
  await set({ scope: 'platform', platform: 'weibo', enabled: true });
  assert.equal(runtime.store.dueJob(Date.now()), null);
  await set({ scope: 'target', uid: '1234567890', enabled: true });
  assert.ok(runtime.store.dueJob(Date.now()));
  const invalid = await fetch(base + '/monitoring', { method: 'POST', headers, body: JSON.stringify({ scope: 'all', enabled: 'false' }) });
  assert.equal(invalid.status, 400);
  assert.equal(runtime.store.getSetting('monitorEnabled'), true);
});

test('博主资料可独立刷新，不解除监控暂停；仍遵守请求节奏', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  runtime.store.setAccount({ status: 'paused', reason: '保留暂停', cooldown_until: 0 });
  let calls = 0;
  runtime.browser.profile = async (uid, options) => {
    await runtime.worker.beforeRequest(options); calls++;
    assert.equal(uid, '1234567890');
    return { name: '真实昵称', avatar: 'https://tva1.sinaimg.cn/portrait.jpg' };
  };
  const refresh = () => fetch(base + '/targets/profile', { method: 'POST', headers, body: JSON.stringify({ uid: '1234567890', platform: 'weibo' }) });
  assert.equal((await refresh()).status, 200);
  assert.equal(runtime.store.target('1234567890').name, '真实昵称');
  assert.equal(runtime.store.target('1234567890').avatar_url, 'https://tva1.sinaimg.cn/portrait.jpg');
  assert.equal(runtime.store.account().status, 'paused');
  assert.equal((await refresh()).status, 429);
  assert.equal(calls, 1);
});

test('头像只允许读取已保存的微博图片域名，拒绝任意地址', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  runtime.store.db.prepare('UPDATE targets SET avatar_url=? WHERE uid=?').run('http://127.0.0.1/private', '1234567890');
  assert.equal((await fetch(base + '/avatar?uid=1234567890')).status, 404);
  assert.equal((await fetch(base + '/avatar?uid=unknown')).status, 404);
});

test('微博标识随插件本地提供，返回可识别的 ICO 文件', async t => {
  const { base } = await server(t);
  const response = await fetch(base + '/assets/weibo.ico');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/x-icon');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0, 0, 1, 0]);
  assert.ok(bytes.length > 100);
});

test('新增博主先等待授权、资料读取和记录方式确认，不能绕过引导启动', async t => {
  const { runtime, base } = await server(t);
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const uid = '1234567890';
  assert.equal((await post('/targets', { url: uid })).status, 200);
  assert.equal(runtime.store.target(uid).capture_mode, 'pending');
  assert.ok(runtime.store.jobs().every(job => job.status === 'paused'));
  assert.equal((await post('/targets/start', { uid, mode: 'from_now' })).status, 409);
  runtime.store.setAccount({ status: 'ready' });
  assert.equal(runtime.store.dueJob(Date.now()), null);
  assert.equal((await post('/targets/start', { uid, mode: 'from_now' })).status, 409);
  const job = runtime.store.jobs()[0];
  assert.equal((await post('/jobs/' + job.id + '/resume', {})).status, 409);
  assert.equal((await post('/history/range', { uid })).status, 409);
  runtime.browser.profile = async () => ({ name: '测试昵称', avatar: null, total: 2345 });
  assert.equal((await post('/targets/profile', { uid })).status, 200);
  assert.equal(runtime.store.target(uid).profile_total, 2345);
  assert.equal((await post('/targets/start', { uid, mode: 'from_now' })).status, 200);
  const target = runtime.store.target(uid);
  assert.equal(target.capture_mode, 'from_now');
  assert.ok(Math.abs(target.record_from - Date.now()) < 2000);
  assert.equal(runtime.store.jobs().find(job => job.kind === 'updates').status, 'queued');
  assert.equal(runtime.store.jobs().find(job => job.kind === 'history').status, 'paused');
  assert.equal((await post('/targets/start', { uid, mode: 'history' })).status, 400);
  assert.equal(runtime.store.targetProgress()[0].history.reportedTotal, 2345);
  assert.equal((await post('/targets', { url: '1234567891' })).status, 200);
  assert.equal((await post('/targets/profile', { uid: '1234567891' })).status, 200);
  assert.equal((await post('/targets/start', { uid: '1234567891', mode: 'history', from: '2026-10-01', to: '2026-10-31' })).status, 200);
  assert.ok(runtime.store.jobs().filter(job => job.uid === '1234567891').every(job => job.status === 'queued'));
  assert.equal(runtime.store.target('1234567891').history_from, Date.parse('2026-10-01T00:00:00+08:00'));
});

test('日期范围修改只重置历史任务，不丢正文、不改变更新检查；非法日期被拒绝', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  runtime.store.savePost(normalizePost({ idstr: '10000000000000001', user: { idstr: '1234567890' }, text: '保留正文', created_at: '2026-11-01T10:00:00+08:00' }, '1234567890'));
  const update = runtime.store.jobs().find(job => job.kind === 'updates');
  const request = body => fetch(base + '/history/range', { method: 'POST', headers, body: JSON.stringify({ uid: '1234567890', ...body }) });
  assert.equal((await request({ from: '2026-10-01', to: '2026-11-01' })).status, 200);
  assert.equal(runtime.store.target('1234567890').history_from, Date.parse('2026-10-01T00:00:00+08:00'));
  assert.equal(runtime.store.count(), 1);
  assert.deepEqual(runtime.store.job(update.id), update);
  for (const dates of [{ from: '2026-02-30' }, { from: '2026-11-01', to: '2026-10-01' }, { to: '2099-01-01' }]) assert.equal((await request(dates)).status, 400);
});

test('原创与转发统计和筛选，按博主确认未读不会清除其他博主消息', async t => {
  const { runtime, base } = await server(t);
  for (const uid of ['1234567890', '1234567891']) runtime.store.addTarget(uid);
  const original = { idstr: '10000000000000001', user: { idstr: '1234567890' }, text: '原创', created_at: '2026-11-01T10:00:00+08:00' };
  runtime.store.savePost(normalizePost(original, '1234567890'));
  runtime.store.savePost(normalizePost({ ...original, idstr: '10000000000000002', retweeted_status: { idstr: '9', text: '原博', user: { screen_name: '原作者' } } }, '1234567890'));
  assert.equal(runtime.store.archiveSummary()[0].original_count, 1);
  assert.equal(runtime.store.archiveSummary()[0].repost_count, 1);
  assert.equal((await (await fetch(base + '/posts?kind=repost')).json()).items.length, 1);
  for (const uid of ['1234567890', '1234567891']) runtime.store.notice('update', '新动态', Date.now(), uid);
  const r = await fetch(base + '/notices/read', { method: 'POST', headers, body: JSON.stringify({ uid: '1234567890', kind: 'update' }) });
  assert.equal(r.status, 200);
  assert.deepEqual((await (await fetch(base + '/status')).json()).unreadContent, { total: 1, authors: [{ uid: '1234567891', count: 1 }] });
});

test('移除旧博主总开关后，明确开启单项只恢复这一项，不带起另一项或绕过平台/总控', async t => {
  const { runtime, base } = await server(t), uid = '1234567890';
  runtime.store.addTarget(uid); runtime.store.setSetting('targetEnabled:' + uid, false);
  runtime.store.setSetting('monitorEnabled', false); runtime.store.setSetting('platformEnabled:weibo', false);
  const jobs = runtime.store.jobs(), updates = jobs.find(job => job.kind === 'updates'), history = jobs.find(job => job.kind === 'history');
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('/jobs/' + updates.id + '/resume', { enableTarget: true })).status, 200);
  assert.equal(runtime.store.getSetting('targetEnabled:' + uid), true);
  assert.equal(runtime.store.job(updates.id).status, 'queued'); assert.equal(runtime.store.job(history.id).status, 'paused');
  runtime.store.setSetting('targetEnabled:' + uid, false);
  assert.equal((await post('/history/range', { uid, enableTarget: true })).status, 200);
  assert.equal(runtime.store.job(history.id).status, 'queued'); assert.equal(runtime.store.job(updates.id).status, 'paused');
  assert.equal(runtime.store.getSetting('monitorEnabled'), false); assert.equal(runtime.store.getSetting('platformEnabled:weibo'), false);
  assert.equal((await post('/jobs/' + updates.id + '/resume', { enableTarget: 'yes' })).status, 400);
});

test('分时设置持久化并支持一分钟；非法重叠不会部分保存或自动恢复监控', async t => {
  const { runtime, base } = await server(t);
  runtime.store.addTarget('1234567890');
  runtime.store.setSetting('monitorEnabled', false);
  const body = { platform: 'weibo', requestGapSeconds: 15, historyGapSeconds: 60, intervalMinutes: 1,
    schedule: { enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1 }] } };
  const save = input => fetch(base + '/settings', { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal((await save(body)).status, 200);
  assert.deepEqual(runtime.store.getSetting('schedule:weibo'), body.schedule);
  assert.equal(runtime.store.target('1234567890').interval_ms, 60000);
  const status = await (await fetch(base + '/status')).json();
  assert.deepEqual(status.platforms[0].schedule, body.schedule);
  assert.ok([60000, 3600000].includes(status.platforms[0].frequency.intervalMs));
  assert.ok(status.platforms[0].frequency.nextChangeAt > Date.now());
  assert.ok([60000, 3600000].includes(status.platforms[0].frequency.nextIntervalMs));
  assert.equal(status.progress[0].intervalMs, status.platforms[0].frequency.intervalMs);
  assert.equal(status.enabled, false);
  assert.equal((await save({ ...body, requestGapSeconds: 30, schedule: { ...body.schedule, windows: [...body.schedule.windows, { start: '14:00', end: '16:00', intervalMinutes: 5 }] } })).status, 400);
  assert.equal(runtime.worker.requestGapMs, 15000);
  assert.deepEqual(runtime.store.getSetting('schedule:weibo'), body.schedule);
});

test('博主齿轮的独立频率实际生效，平台默认设置不覆盖个人频率，恢复跟随不影响其他博主或开关', async t => {
  const { runtime, base } = await server(t);
  for (const uid of ['1234567890', '1234567891']) runtime.store.addTarget(uid);
  runtime.store.setSetting('monitorEnabled', false);
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const policy = { uid: '1234567890', inherit: false, intervalMinutes: 7, schedule: { enabled: false, fallbackMinutes: 60, windows: [] } };
  assert.equal((await post('/targets/policy', policy)).status, 200);
  let status = await (await fetch(base + '/status')).json();
  assert.equal(status.progress.find(row => row.uid === policy.uid).intervalMs, 420000);
  assert.equal(status.progress.find(row => row.uid === '1234567891').intervalMs, 900000);
  const platform = { intervalMinutes: 3, requestGapSeconds: 15, historyGapSeconds: 60, schedule: { enabled: false, fallbackMinutes: 60, windows: [] } };
  assert.equal((await post('/settings', platform)).status, 200);
  assert.equal(runtime.store.targetProgress().find(row => row.uid === policy.uid).intervalMs, 420000);
  assert.equal((await post('/settings', { ...platform, applyToAll: true })).status, 200);
  assert.equal(runtime.store.targetProgress().find(row => row.uid === policy.uid).intervalMs, 420000, '旧客户端即使传 applyToAll 也不能覆盖个人频率');
  assert.equal((await post('/targets/policy', policy)).status, 200);
  assert.equal((await post('/targets/policy', { uid: policy.uid, inherit: true })).status, 200);
  status = await (await fetch(base + '/status')).json();
  assert.equal(status.targets.find(row => row.uid === policy.uid).policy, null);
  assert.equal(status.progress.find(row => row.uid === policy.uid).intervalMs, 180000);
  assert.equal(status.enabled, false);
});

test('消息未读统计不受最近100条列表限制，分类已读不清除其他分类并刷新统计', async t => {
  const { runtime, base } = await server(t);
  for (let i = 0; i < 110; i++) runtime.store.notice('update', '动态' + i);
  runtime.store.notice('attention', '连接提醒');
  assert.equal(runtime.store.notices().length, 100);
  assert.deepEqual(runtime.store.unreadNotices(), { all: 111, update: 110, attention: 1, task: 0 });
  assert.equal((await fetch(base + '/notices/read', { method: 'POST', headers, body: JSON.stringify({ kind: 'attention' }) })).status, 200);
  assert.deepEqual(runtime.store.unreadNotices(), { all: 110, update: 110, attention: 0, task: 0 });
  const status = await (await fetch(base + '/status')).json();
  assert.equal(status.unreadNotices.all, 110);
});

test('今日新增按北京时间统计今日发布且首次保存的新动态，排除补存历史、监控前消息和重复写入', async t => {
  const { runtime, base } = await server(t);
  const now = Date.parse('2026-11-06T10:00:00+08:00'), uid = '1234567890';
  runtime.store.addTarget(uid, '统计测试', Date.parse('2026-11-06T09:00:00+08:00'));
  const save = (id, published, saved = now) => runtime.store.savePost(normalizePost({ idstr: id, user: { idstr: uid, screen_name: '统计测试' }, created_at: published, text: '测试消息' }, uid), saved);
  save('10001', '2026-11-06T09:30:00+08:00');
  save('10002', '2026-10-06T09:30:00+08:00');
  save('10003', '2026-11-06T08:30:00+08:00');
  assert.equal(runtime.store.todayNewCount(now), 1);
  save('10001', '2026-11-06T09:30:00+08:00', now + 1000);
  assert.equal(runtime.store.todayNewCount(now + 1000), 1);
  save('10004', '2026-11-06T09:31:00+08:00');
  assert.equal(runtime.store.todayNewCount(now), 2);
  assert.equal(runtime.store.todayNewCount(Date.parse('2026-11-07T00:01:00+08:00')), 0);
  assert.equal(runtime.store.count(), 4);
  const status = await (await fetch(base + '/status')).json();
  assert.equal(typeof status.todayNewCount, 'number');
});

test('原创缓存筛选持久化，切换只重置历史任务，重复开始保留断点，非法筛选不写入', async t => {
  const { runtime, base } = await server(t);
  const uid = '1234567890'; runtime.store.addTarget(uid);
  const history = runtime.store.jobs().find(job => job.kind === 'history');
  const update = runtime.store.jobs().find(job => job.kind === 'updates');
  runtime.store.updateJob(history.id, { checkpoint: { page: 7 }, pages: 6 });
  const post = body => fetch(base + '/history/range', { method: 'POST', headers, body: JSON.stringify({ uid, ...body }) });
  assert.equal((await post({ originalOnly: true })).status, 200);
  assert.equal(runtime.store.job(history.id).pages, 0);
  runtime.store.updateJob(history.id, { checkpoint: { page: 4 }, pages: 3 });
  assert.equal((await post({ originalOnly: true })).status, 200);
  assert.equal(runtime.store.job(history.id).pages, 3);
  const status = await (await fetch(base + '/status')).json();
  assert.equal(status.targets[0].historyOriginalOnly, true);
  assert.equal(status.progress[0].history.originalOnly, true);
  assert.equal((await post({ originalOnly: 'true' })).status, 400);
  assert.equal(runtime.store.getSetting('historyOriginalOnly:' + uid), true);
  assert.deepEqual(runtime.store.job(update.id), update);
  assert.equal((await post({ originalOnly: false })).status, 200);
  assert.equal(runtime.store.job(history.id).pages, 0);
});

test('平台节点能批量开始和暂停旧消息缓存，不改变增量任务、正文或总控，未确认博主不会被偷偷开启', async t => {
  const { runtime, base } = await server(t);
  for (const uid of ['1234567890', '1234567891']) runtime.store.addTarget(uid);
  runtime.store.addTarget('1234567892', '待确认', Date.now(), 'weibo', { captureMode: 'pending' });
  runtime.store.setSetting('monitorEnabled', false);
  const updates = runtime.store.jobs().filter(job => job.kind === 'updates');
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('/history/range', { scope: 'platform', from: '2026-11-01', to: '2026-11-05' })).status, 200);
  assert.equal(runtime.store.target('1234567890').history_from, Date.parse('2026-11-01T00:00:00+08:00'));
  assert.equal(runtime.store.target('1234567892').history_from, null);
  assert.equal((await post('/history/pause', { scope: 'platform' })).status, 200);
  assert.ok(runtime.store.jobs().filter(job => job.kind === 'history').every(job => job.status === 'paused'));
  assert.deepEqual(runtime.store.jobs().filter(job => job.kind === 'updates'), updates);
  assert.equal(runtime.store.getSetting('monitorEnabled'), false);
});

test('主动设置立即读取独立资料，不等后台间隔或在途监控；仍保留冷却和任务开关', async t => {
  const { runtime, base } = await server(t), uid = '1234567890';
  runtime.store.addTarget(uid, uid, Date.now(), 'weibo', { captureMode: 'pending' });
  const next = Date.now() + 3600000;
  runtime.store.setAccount({ status: 'ready', next_request_at: next });
  runtime.store.setSetting('monitorEnabled', false);
  let release;
  runtime.worker.busy = new Promise(resolve => { release = resolve; });
  let calls = 0;
  runtime.browser.profile = async (id, options) => {
    await runtime.worker.beforeRequest(options); calls++;
    return { name: '独立资料读取', avatar: null, total: 123 };
  };
  const refresh = interactive => fetch(base + '/targets/profile', { method: 'POST', headers, body: JSON.stringify({ uid, interactive }) });
  try {
    assert.equal((await refresh(true)).status, 200);
    assert.equal(calls, 1);
    assert.equal(runtime.store.target(uid).name, '独立资料读取');
    assert.equal(runtime.store.account().next_request_at, next);
    assert.equal(runtime.store.getSetting('monitorEnabled'), false);
    assert.ok(runtime.store.jobs().every(job => job.status === 'paused'));
  } finally { release(); runtime.worker.busy = null; }
  assert.equal((await refresh(true)).status, 429, '重复主动读取仍遵守独立资料请求间隔');
  assert.equal(calls, 1);
  assert.equal((await refresh(false)).status, 429, '自动读取仍遵守后台间隔');
  runtime.store.setAccount({ cooldown_until: Date.now() + 60000 });
  assert.equal((await refresh(true)).status, 429, '主动读取不绕过平台冷却');
  assert.equal(calls, 1);
  assert.equal((await refresh('yes')).status, 400);
});

test('雪球官网图标本地提供', async t => {
  const { base } = await server(t);
  const response = await fetch(base + '/assets/xueqiu.png');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('列表一键开启待配置博主的单项任务，沿用标准或个人频率，另一项不跟随开启', async t => {
  const { runtime, base } = await server(t);
  runtime.store.setAccount({ status: 'ready' });
  runtime.store.setSetting('intervalMs', 900000);
  for (const [uid, kind] of [['1234567890', 'updates'], ['1234567891', 'history']]) {
    runtime.store.addTarget(uid, '博主', Date.now(), 'weibo', { captureMode: 'pending' });
    runtime.store.db.prepare('UPDATE targets SET profile_checked_at=? WHERE uid=?').run(Date.now(), uid);
    if (kind === 'history') runtime.store.setSetting('targetPolicy:' + uid, { intervalMs: 420000, schedule: null });
    const response = await fetch(base + '/targets/start', { method: 'POST', headers, body: JSON.stringify({ uid, mode: kind === 'history' ? 'history' : 'from_now', kind }) });
    assert.equal(response.status, 200);
    const jobs = runtime.store.jobs().filter(job => job.uid === uid);
    assert.equal(jobs.find(job => job.kind === kind).status, 'queued');
    assert.equal(jobs.find(job => job.kind !== kind).status, 'paused');
    assert.equal(runtime.store.targetProgress().find(item => item.uid === uid).intervalMs, kind === 'history' ? 420000 : 900000);
  }
});

test('新动态频率和历史读取速度分开保存，不互相覆盖或改变任务与个人设置', async t => {
  const { runtime, base } = await server(t), uid = '1234567890';
  runtime.store.addTarget(uid);
  runtime.store.setSetting('targetPolicy:' + uid, { intervalMs: 420000, schedule: null });
  const before = runtime.store.jobs().map(job => [job.id, job.status]).sort();
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('/settings', { intervalMinutes: 1, schedule: { enabled: false, fallbackMinutes: 60, windows: [] } })).status, 200);
  assert.equal(runtime.worker.requestGapMs, 15000);
  assert.equal((await post('/settings/history', { historyGapSeconds: 90 })).status, 200);
  assert.equal(runtime.store.getSetting('targetDefaults').intervalMs, 60000);
  assert.equal(runtime.store.getSetting('targetDefaults').historyGapMs, 90000);
  assert.equal(runtime.store.target(uid).history_gap_ms, 90000);
  assert.equal(runtime.store.targetProgress().find(item => item.uid === uid).intervalMs, 420000);
  assert.deepEqual(runtime.store.jobs().map(job => [job.id, job.status]).sort(), before);
  assert.equal((await post('/settings', { intervalMinutes: 3 })).status, 200);
  assert.equal(runtime.store.target(uid).history_gap_ms, 90000);
  assert.equal((await post('/settings/history', { historyGapSeconds: 1 })).status, 400);
  assert.equal(runtime.store.target(uid).history_gap_ms, 90000);
});

test('头像接口优先本地文件，重复加载不再联网；头像更新与浏览器版本缓存对应', async t => {
  let requests = 0;
  const { runtime, base } = await server(t, { avatarFetch: async () => new Response(Buffer.from(String(++requests)), { headers: { 'Content-Type': 'image/png' } }) });
  const uid = '1234567890', image = 'https://tva1.sinaimg.cn/old.png', newer = 'https://tva1.sinaimg.cn/new.png';
  runtime.store.addTarget(uid);
  const setAvatar = image => runtime.store.db.prepare('UPDATE targets SET avatar_url=? WHERE uid=?').run(image, uid);
  setAvatar(image);
  const read = version => fetch(base + '/avatar?uid=' + uid + (version ? '&v=' + encodeURIComponent(version) : ''), { cache: 'no-store' });
  const first = await read(image);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control'), /immutable/);
  assert.equal(await first.text(), '1');
  assert.equal(await (await read(image)).text(), '1');
  assert.equal(requests, 1);
  assert.doesNotMatch((await read()).headers.get('cache-control'), /immutable/);
  setAvatar(newer);
  const changed = await read(newer);
  assert.equal(await changed.text(), '2');
  assert.equal(requests, 2);
  const stale = await read(image);
  assert.doesNotMatch(stale.headers.get('cache-control'), /immutable/);
  assert.equal(await stale.text(), '2');
  assert.equal(requests, 2);
});

test('HTTP 重复监控规则完整保存与回读，平台更新不覆盖个人规则；非法日期不落库', async t => {
  const { runtime, base } = await server(t), uid = '1234567890';
  runtime.store.addTarget(uid, '重复规则测试', Date.now());
  const schedule = { enabled: true, fallbackMinutes: 60, windows: [{ start: '09:00', end: '15:00', intervalMinutes: 1, repeat: 'biweekly', date: '2026-11-06' }] };
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('/targets/policy', { platform: 'weibo', uid, inherit: false, intervalMinutes: 15, schedule })).status, 200);
  const state = await (await fetch(base + '/status')).json();
  assert.deepEqual(state.targets.find(target => target.uid === uid).policy.schedule, schedule);
  assert.equal((await post('/settings', { platform: 'weibo', intervalMinutes: 10, schedule: { ...schedule, windows: [{ ...schedule.windows[0], repeat: 'monthly' }] } })).status, 200);
  assert.deepEqual(runtime.store.getSetting('targetPolicy:' + uid).schedule, schedule);
  assert.equal((await post('/targets/policy', { platform: 'weibo', uid, inherit: false, intervalMinutes: 15, schedule: { ...schedule, windows: [{ ...schedule.windows[0], date: '2026-02-30' }] } })).status, 400);
  assert.deepEqual(runtime.store.getSetting('targetPolicy:' + uid).schedule, schedule);
});

test('消息查看按帖子 ID 精确读取，UID 过滤不能跨博主串读', async t => {
  const { runtime, base } = await server(t);
  const uid = '1234567890'; runtime.store.addTarget(uid, '作者'); runtime.store.addTarget('9876543210', '另一作者');
  for (const id of ['10001', '10002']) runtime.store.savePost({ id, uid, author: '作者', publishedAt: Date.now(), text: '动态 ' + id, url: 'https://weibo.com/' + uid + '/' + id, complete: true, raw: {} });
  const one = await (await fetch(base + '/posts?uid=' + uid + '&postId=10001')).json();
  assert.deepEqual(one.items.map(p => p.id), ['10001']);
  const other = await (await fetch(base + '/posts?uid=9876543210&postId=10001')).json();
  assert.deepEqual(other.items, []);
  assert.equal((await (await fetch(base + '/posts?uid=' + uid)).json()).items.length, 2);
});
