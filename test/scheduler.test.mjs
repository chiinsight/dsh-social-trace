import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { normalizePost } from '../lib/platforms/weibo/index.js';

const uid = '1234567890';
const at = text => Date.parse('2026-11-05T' + text + '+08:00');
const plan = { enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1 }] };
const raw = (id, published, extra = {}) => ({ idstr: id, user: { idstr: uid, screen_name: '测试' }, created_at: new Date(published).toISOString(), text: '新动态', ...extra });
function fixture(t, timeline = async () => ({ items: [], end: true })) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-scheduler-'));
  const store = new Store(directory); let now = at('14:00:00');
  store.addTarget(uid, '测试', now, 'weibo', { archiveHistory: false });
  store.db.prepare("UPDATE targets SET capture_mode='from_now',record_from=? WHERE uid=?").run(now, uid);
  store.setAccount({ status: 'ready' });
  let completed = 0;
  const adapter = { id: 'weibo', normalizePost, isPinned: raw => !!raw.isTop, needsRequest: () => false, timeline, complete: async post => { completed++; return post; } };
  const worker = new Worker(store, adapter, { now: () => now });
  t.after(async () => { await worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const update = store.jobs().find(job => job.kind === 'updates');
  return { store, worker, update, setTime: value => { now = value; }, now: () => now, completed: () => completed };
}

test('从现在记录且没有新帖时，每轮只读第一页，不沿历史翻页，不排队旧正文', async t => {
  const calls = [];
  const h = fixture(t, async (_uid, page) => { calls.push(page); return { items: [raw('1', at('13:00:00')), raw('2', at('12:00:00'), { isTop: true })], end: false }; });
  h.store.db.prepare('UPDATE targets SET interval_ms=60000 WHERE uid=?').run(uid);
  for (let cycle = 0; cycle < 3; cycle++) {
    h.setTime(at('14:00:00') + cycle * 60000);
    await h.worker.tick(); assert.equal(h.store.job(h.update.id).checkpoint.pending.length, 0);
    await h.worker.tick();
  }
  assert.deepEqual(calls, [1, 1, 1]); assert.equal(h.store.count(), 0); assert.equal(h.completed(), 0);
});

test('新增跨多页时补到上轮边界即止，旧基线无需入库，完整内容不重复读取', async t => {
  let cycle = 0; const pages = [];
  const boundary = raw('1', at('13:59:00'));
  const h = fixture(t, async (_uid, page) => {
    pages.push(page);
    return { items: cycle === 0 ? [boundary] : page === 1 ? [raw('3', at('14:01:00')), raw('2', at('14:00:30'))] : [boundary], end: false };
  });
  h.store.db.prepare('UPDATE targets SET interval_ms=60000 WHERE uid=?').run(uid);
  await h.worker.tick(); await h.worker.tick();
  assert.equal(h.store.count(), 0);
  cycle = 1; h.setTime(at('14:01:00'));
  for (let i = 0; i < 6; i++) await h.worker.tick();
  assert.deepEqual(pages, [1, 1, 2]); assert.equal(h.store.count(), 2); assert.equal(h.completed(), 2);
  const saves = h.store.archiveSummary()[0].last_saved_at;
  h.setTime(at('14:02:00')); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.completed(), 2); assert.equal(h.store.archiveSummary()[0].last_saved_at, saves);
});

test('日常增量在同页遇到上次最新页边界后结束，不为一条新动态多等一轮翻页', async t => {
  const pages = [];
  const h = fixture(t, async (_, page) => { pages.push(page); return { items: [raw('2', at('14:00:30')), raw('1', at('13:59:00'))], end: false }; });
  h.store.db.prepare('UPDATE targets SET interval_ms=60000 WHERE uid=?').run(uid);
  h.store.updateJob(h.update.id, { checkpoint: { initialized: true, lastScanAt: at('14:00:00'), boundaryIds: ['1'] }, next_run_at: at('14:01:00') });
  h.setTime(at('14:01:00'));
  for (let i = 0; i < 5; i++) await h.worker.tick();
  assert.deepEqual(pages, [1]);
  assert.equal(h.store.count(), 1);
  assert.equal(h.store.job(h.update.id).next_run_at, at('14:02:00'));
  const record = h.store.targetProgress(h.now())[0].recentChecks[0];
  assert.equal(record.newestPublishedAt, at('14:00:30'));
  assert.equal(record.count, 2);
  assert.equal(record.status, 'success');
});

test('已缓存历史或当前置顶的旧边界不提前截断更新翻页', async t => {
  const h = fixture(t, async () => ({ items: [raw('2', at('14:00:30')), raw('1', at('13:59:00'), { isTop: true })], end: false }));
  h.store.db.prepare('UPDATE targets SET interval_ms=60000 WHERE uid=?').run(uid);
  h.store.updateJob(h.update.id, { checkpoint: { initialized: true, lastScanAt: at('14:00:00'), boundaryIds: ['1'] } });
  h.setTime(at('14:01:00')); await h.worker.tick();
  assert.equal(h.store.job(h.update.id).checkpoint.foundKnown, false);
});

test('最新页使用短间隔，历史与长文仍保留原节奏，冷却不被绕过', async t => {
  const h = fixture(t);
  h.worker.monitoringGapMs = 3000;
  await h.worker.beforeRequest({ monitoringHead: true });
  assert.equal(h.store.account().next_request_at, h.now() + 3000);
  await assert.rejects(h.worker.beforeRequest({ monitoringHead: true }), error => error.kind === 'wait');
  h.setTime(h.now() + 3000);
  await h.worker.beforeRequest();
  assert.equal(h.store.account().next_request_at, h.now() + 3000);
  assert.equal(h.store.getSetting('auxiliaryRequestAt:weibo'), h.now() + 15000);
  h.setTime(h.now() + 3000);
  await assert.rejects(h.worker.beforeRequest(), error => error.kind === 'wait');
  await h.worker.beforeRequest({ monitoringHead: true });
  h.store.setAccount({ cooldown_until: h.now() + 120000 });
  h.setTime(h.now() + 15000);
  await assert.rejects(h.worker.beforeRequest({ monitoringHead: true }), error => error.kind === 'wait');
});

test('延迟检查与账号吞吐分开计算，个人频率和关闭状态被正确计入', t => {
  const h = fixture(t);
  const uids = [uid];
  for (let i = 1; i < 15; i++) {
    const other = String(Number(uid) + i); uids.push(other);
    h.store.addTarget(other, '测试', h.now(), 'weibo', { archiveHistory: false });
  }
  h.store.db.prepare("UPDATE targets SET capture_mode='from_now',interval_ms=60000").run();
  for (const job of h.store.jobs().filter(job => job.kind === 'updates')) h.store.updateJob(job.id, {
    checkpoint: { lastScanAt: h.now() - 180000 }, next_run_at: h.now() - 120000,
  });
  let health = h.store.monitoringHealth('weibo', 15000, h.now());
  assert.equal(health.capacityLimited, true); assert.equal(health.minimumCycleMs, 225000);
  assert.equal(health.delayed.length, 15);
  health = h.store.monitoringHealth('weibo', 3000, h.now());
  assert.equal(health.capacityLimited, false); assert.equal(health.minimumCycleMs, 45000);
  for (const other of uids.slice(1)) h.store.setSetting('targetPolicy:' + other, { intervalMs: 3600000 });
  assert.equal(h.store.monitoringHealth('weibo', 15000, h.now()).capacityLimited, false);
  h.store.setSetting('monitorEnabled', false);
  assert.equal(h.store.monitoringHealth('weibo', 3000, h.now()).activeAuthors, 0);
  assert.equal(h.store.monitoringHealth('weibo', 3000, h.now()).delayed.length, 0);
});

test('15 位博主按北京时间每分钟检查，HTTP 正常时一轮不再串行等待 15 秒每人', async t => {
  const calls = new Map();
  const h = fixture(t, async (author, _, __, options) => {
    await h.worker.beforeRequest(options);
    calls.set(author, [...(calls.get(author) || []), h.now()]);
    return { items: [], end: true };
  });
  h.worker.monitoringGapMs = 3000;
  for (let i = 1; i < 15; i++) h.store.addTarget(String(Number(uid) + i), '测试', h.now(), 'weibo', { archiveHistory: false });
  h.store.db.prepare("UPDATE targets SET capture_mode='from_now',interval_ms=60000").run();
  const start = h.now();
  for (let i = 0; i < 300 && h.now() < start + 120000; i++) {
    await h.worker.tick();
    h.setTime(h.now() + h.worker.nextDelay());
  }
  assert.equal(calls.size, 15);
  for (const checks of calls.values()) {
    assert.ok(checks.length >= 2);
    assert.ok(checks[0] - start < 60000);
    assert.ok(checks[1] - checks[0] <= 61000);
  }
});

test('已到期的最新页优先于较早排队的长文与补查页', t => {
  const h = fixture(t), other = '1234567891';
  h.store.addTarget(other, '另一位测试博主', h.now(), 'weibo', { archiveHistory: false });
  h.store.db.prepare("UPDATE targets SET capture_mode='from_now'").run();
  const head = h.store.jobs().find(job => job.uid === other && job.kind === 'updates');
  h.store.updateJob(h.update.id, { checkpoint: { page: 2 }, next_run_at: h.now() - 600000 });
  h.store.updateJob(head.id, { next_run_at: h.now() });
  assert.equal(h.worker.pickJob().job.id, head.id);
  h.store.updateJob(h.update.id, { checkpoint: { page: 1, pageLoaded: true, pending: [{ isLongText: true }] } });
  h.worker.adapter.needsRequest = () => true;
  assert.equal(h.worker.pickJob().job.id, head.id);
});

test('睡眠恢复不依赖进程重启，冷却结束后补查间断，手动关闭的任务不被开启', async t => {
  const h = fixture(t);
  h.store.updateJob(h.update.id, { checkpoint: { initialized: true, lastScanAt: h.now() - 60000 }, last_success_at: h.now() - 60000 });
  h.worker.running = true; h.worker.lastTickAt = h.now();
  h.setTime(h.now() + 3600000);
  h.store.setAccount({ cooldown_until: h.now() + 120000 });
  await h.worker.tick();
  assert.equal(h.worker.resumeCheckPending, true);
  assert.equal(h.store.job(h.update.id).checkpoint.catchupFrom, undefined);
  h.setTime(h.now() + 120000);
  await h.worker.tick();
  assert.ok(h.store.job(h.update.id).checkpoint.catchupFrom < h.now() - 3600000);
  assert.equal(h.worker.resumeCheckPending, false);
  const history = h.store.jobs().find(job => job.kind === 'history');
  assert.equal(history.status, 'paused');
});

test('分时边界即时调整下次到期时间，失败退避与任务暂停不会被新频率覆盖', t => {
  const h = fixture(t); h.store.setSetting('schedule:weibo', plan);
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: at('07:40:00') } });
  h.setTime(at('07:59:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, at('08:00:00'));
  assert.equal(h.worker.nextDelay(), 60000);
  h.setTime(at('08:00:00')); h.worker.rescheduleUpdates();
  assert.ok(h.store.job(h.update.id).next_run_at <= h.now());
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: at('14:59:00') } });
  h.setTime(at('15:00:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, at('15:00:00'));
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: at('08:00:00'), retryAt: at('08:20:00') } });
  h.setTime(at('08:05:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, at('08:20:00'));
  h.store.updateJob(h.update.id, { status: 'paused', next_run_at: 123 }); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, 123);
});

test('博主独立分时边界生效，不被平台固定频率覆盖', t => {
  const h = fixture(t);
  h.store.setSetting('targetPolicy:' + uid, { intervalMs: 900000, schedule: plan });
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: at('07:40:00') } });
  h.setTime(at('07:59:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, at('08:00:00'));
  assert.equal(h.worker.boundaryAt, at('08:00:00'));
  h.setTime(at('08:00:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, at('07:41:00'));
  assert.equal(h.worker.boundaryAt, at('15:00:00'));
});

test('暂停与未授权空闲时无心跳写盘；本地正文处理不被网络间隔拖慢', async t => {
  const h = fixture(t); h.store.setSetting('monitorEnabled', false);
  const before = h.store.db.prepare('SELECT total_changes() AS n').get().n;
  for (let i = 0; i < 100; i++) await h.worker.tick();
  assert.equal(h.store.db.prepare('SELECT total_changes() AS n').get().n, before);
  assert.equal(h.worker.nextDelay(), 60000);
  h.store.setSetting('monitorEnabled', true);
  h.store.setAccount({ next_request_at: h.now() + 15000 });
  h.store.updateJob(h.update.id, { checkpoint: { pageLoaded: true, pending: [raw('1', h.now())] } });
  assert.equal(h.worker.nextDelay(), 50);
});

test('临近新动态检查时不让历史请求占用账号请求额度；退避跨时段不产生忙轮询', async t => {
  let requests = 0;
  const h = fixture(t, async () => { requests++; return { items: [], end: true }; });
  const history = h.store.jobs().find(job => job.kind === 'history');
  h.store.updateJob(history.id, { status: 'queued' });
  h.store.updateJob(h.update.id, { next_run_at: h.now() + 5000, checkpoint: { retryAt: h.now() + 5000 } });
  await h.worker.tick(); assert.equal(requests, 0); assert.equal(h.worker.nextDelay(), 5000);
  h.setTime(h.now() + 5000); await h.worker.tick(); assert.equal(requests, 1);
  h.worker.boundaryAt = h.now() - 1;
  h.store.setAccount({ cooldown_until: h.now() + 10000 });
  assert.equal(h.worker.nextDelay(), 10000);
});

test('每周规则进入真实调度：命中日期切到分钟级，次日回到兜底，不改个人与暂停任务', t => {
  const h = fixture(t), date = stamp => Date.parse(stamp + '+08:00');
  h.store.setSetting('targetPolicy:' + uid, { intervalMs: 900000, schedule: { enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1, repeat: 'weekly', date: '2026-11-06' }] } });
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: date('2026-11-06T07:40:00') } });
  h.setTime(date('2026-11-06T08:00:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, date('2026-11-06T07:41:00'));
  assert.equal(h.worker.boundaryAt, date('2026-11-06T15:00:00'));
  h.store.updateJob(h.update.id, { checkpoint: { lastScanAt: date('2026-11-07T07:40:00') } });
  h.setTime(date('2026-11-07T08:00:00')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, date('2026-11-07T08:00:00'));
  assert.equal(h.worker.boundaryAt, date('2026-11-13T08:00:00'));
  h.store.updateJob(h.update.id, { status: 'paused', next_run_at: 123 }); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, 123);
});

test('列表响应时记录监控发现时间，补全文较晚也不冒充发现时间；提醒关联具体原文', async t => {
  const published = at('14:00:30'), discovered = at('14:01:00'), saved = at('14:01:45');
  const h = fixture(t, async () => ({ items: [raw('90000000000000001', published)], end: true }));
  h.setTime(discovered); await h.worker.tick();
  assert.equal(h.store.job(h.update.id).checkpoint.detectedAt, discovered);
  h.setTime(saved); await h.worker.tick();
  const post = h.store.posts()[0], notice = h.store.notices().find(notice => notice.kind === 'update');
  assert.equal(post.published_at, published); assert.equal(post.detected_at, discovered); assert.equal(post.first_seen_at, saved);
  assert.equal(notice.post_id, post.id); assert.equal(notice.published_at, published); assert.equal(notice.detected_at, discovered); assert.equal(notice.saved_at, saved);
  h.store.savePost(normalizePost(raw(post.id, published), uid), saved + 60000, 'updates', saved + 60000);
  assert.equal(h.store.posts()[0].detected_at, discovered); assert.equal(h.store.posts()[0].first_seen_at, saved);
});

test('首次监控与后续检查都按整点：22:25 添加等到23:00，读取晚了不漂移到下一小时的25分', async t => {
  let scans = 0;
  const h = fixture(t, async () => { scans++; return { items: [], end: true }; });
  const clock = text => Date.parse(text + '+08:00');
  h.store.db.prepare('UPDATE targets SET interval_ms=3600000,record_from=? WHERE uid=?').run(clock('2026-11-06T22:25:18'), uid);
  h.setTime(clock('2026-11-06T22:25:18')); h.worker.rescheduleUpdates();
  assert.equal(h.store.job(h.update.id).next_run_at, clock('2026-11-06T23:00:00'));
  await h.worker.tick(); assert.equal(scans, 0);
  h.setTime(clock('2026-11-06T23:00:15')); await h.worker.tick(); await h.worker.tick();
  assert.equal(scans, 1);
  assert.equal(h.store.job(h.update.id).next_run_at, clock('2026-11-07T00:00:00'));
  h.setTime(clock('2026-11-07T04:17:00')); await h.worker.tick(); await h.worker.tick();
  assert.equal(scans, 2, '错过多个整点只合并补查一次');
  assert.equal(h.store.job(h.update.id).next_run_at, clock('2026-11-07T05:00:00'));
});
