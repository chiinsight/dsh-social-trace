import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { CaptureError } from '../lib/capture-error.js';
import { normalizePost as weiboPost } from '../lib/platforms/weibo/index.js';
import { normalizePost as snowPost } from '../lib/platforms/xueqiu/index.js';

const uid = '1234567890';
const at = value => Date.parse(value + '+08:00');
const origin = at('2026-11-06T08:00:00');
const stamp = minutes => origin + minutes * 60000;
function fixture(t, platform, timeline) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-catchup-'));
  let store = new Store(directory), worker, now = stamp(180), requests = [];
  const key = store.authorKey(uid, platform);
  const raw = (id, minutes, pinned = false) => platform === 'weibo'
    ? { idstr: String(id), user: { idstr: uid, screen_name: '测试作者' }, text: '动态 ' + id, created_at: new Date(stamp(minutes)).toISOString(), isTop: pinned }
    : { id, user_id: Number(uid), user: { id: Number(uid), screen_name: '测试作者' }, text: '动态 ' + id, created_at: stamp(minutes), truncated: false, mark: Number(pinned) };
  const normalizePost = platform === 'weibo' ? weiboPost : snowPost;
  store.addTarget(uid, '测试作者', origin, platform, { archiveHistory: false });
  store.db.prepare('UPDATE targets SET record_from=?,interval_ms=? WHERE uid=?').run(origin, 3600000, key);
  store.setAccount({ status: 'ready' }, platform);
  const job = store.jobs().find(j => j.uid === key && j.kind === 'updates');
  store.updateJob(job.id, { checkpoint: { initialized: true, lastScanAt: stamp(60), boundaryIds: [platform === 'weibo' ? '100' : 'xueqiu:100'] }, last_success_at: stamp(60), next_run_at: stamp(240) });
  function save(record) { const p = normalizePost(record, uid); store.savePost({ ...p, uid: key, id: platform === 'weibo' ? p.id : 'xueqiu:' + p.id }, stamp(60), 'updates'); }
  save(raw(100, 59));
  function makeWorker() {
    const adapter = { id: platform, normalizePost, isPinned: r => !!(r.isTop || r.mark), needsRequest: () => false, complete: async r => r,
      timeline: async (_, page) => { await worker.beforeRequest(); requests.push(page); return timeline(page, { raw, store, now }); } };
    worker = new Worker(store, adapter, { now: () => now, requestGapMs: platform === 'xueqiu' ? 30000 : 15000 });
    worker.wake = () => {};
    return worker;
  }
  makeWorker();
  t.after(async () => { await worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { raw, save, key, id: job.id, get store() { return store; }, get worker() { return worker; }, requests,
    setTime: value => { now = value; },
    async restart() { await worker.stop(); store.close(); store = new Store(directory); makeWorker().start(); },
    async tick() { await worker.tick(); now += 30001; },
    async finish() { for (let i = 0; i < 80; i++) { await this.tick(); const j = store.job(job.id); if (j.checkpoint.initialized && j.checkpoint.page === 1 && !j.checkpoint.pageLoaded && !j.checkpoint.catchupFrom && j.last_success_at > stamp(60)) return; } assert.fail('补查未能完成'); },
  };
}

for (const platform of ['weibo', 'xueqiu']) {
  test(`${platform} 开机立即比对：最新存档被删、跨页且混有已存历史也不漏关机动态`, async t => {
    const h = fixture(t, platform, (page, { raw }) => ({ items: page === 1 ? [raw(1, -100, true), raw(5, 179), raw(900, 170)] : page === 2 ? [raw(4, 150), raw(3, 120)] : page === 3 ? [raw(2, 80)] : [raw(99, 58)], end: false }));
    h.save(h.raw(900, 170));
    await h.restart();
    assert.ok(h.store.job(h.id).next_run_at <= stamp(180), '不等未来整点才补查');
    assert.equal(h.store.targetProgress().find(p => p.uid === h.key).catchup.from, stamp(60));
    await h.finish();
    assert.deepEqual(h.requests, [1, 2, 3, 4]);
    assert.equal(h.store.posts().filter(p => /动态 [2345]$/.test(p.text)).length, 4);
    assert.ok(h.store.hasPost(platform === 'weibo' ? '100' : 'xueqiu:100'), '本地存档不因远端删帖而删除');
    assert.equal(h.store.count(), 6);
    assert.equal(h.store.posts().filter(p => p.capture_kind === 'catchup').length, 4);
    assert.equal(h.store.notices().filter(n => /恢复后补查/.test(n.message)).length, 4);
    assert.equal(h.store.job(h.id).checkpoint.coveredThrough, stamp(180));
    assert.equal(h.store.targetProgress().find(p => p.uid === h.key).catchup, null);
    assert.match(h.store.job(h.id).message, /补查完成/);
    assert.equal(new Date(h.store.job(h.id).next_run_at + 8 * 3600000).getUTCMinutes(), 0, '补查后恢复整点');
  });

  test(`${platform} 最新已存时间对应的所有远端记录删除，按时间界限停止而非扫完整历史`, async t => {
    const h = fixture(t, platform, (_, { raw }) => ({ items: [raw(90, 58)], end: false }));
    h.setTime(stamp(61)); await h.restart(); await h.finish();
    assert.deepEqual(h.requests, [1]);
    assert.equal(h.store.count(), 1);
  });

  test(`${platform} 同一秒不同 ID 不被边界过滤；旧置顶不终止补查`, async t => {
    const h = fixture(t, platform, (page, { raw }) => ({ items: page === 1 ? [raw(1, -100, true), raw(101, 59)] : page === 2 ? [raw(102, 59)] : [raw(90, 58)], end: false }));
    await h.restart(); await h.finish();
    assert.deepEqual(h.requests, [1, 2, 3]);
    assert.equal(h.store.count(), 3);
  });

  test(`${platform} 补查中再次关机先保存持久化的待处理页，随后回头读取新增的首页`, async t => {
    let phase = 0;
    const h = fixture(t, platform, (page, { raw }) => ({ items: phase === 0 ? [raw(2, 80)] : page === 1 ? [raw(3, 250), raw(2, 80)] : [raw(90, 58)], end: false }));
    await h.restart(); await h.tick();
    assert.equal(h.store.job(h.id).checkpoint.pending.length, 1);
    phase = 1; h.setTime(stamp(300)); await h.restart();
    await h.tick();
    assert.equal(h.requests.length, 1, '先消费已落盘的动态，不重抓当前页');
    await h.finish();
    assert.ok(h.store.hasPost(platform === 'weibo' ? '3' : 'xueqiu:3'));
    assert.equal(h.store.count(), 3);
    assert.ok(h.requests.filter(page => page === 1).length === 2, '重新检查关机后变化的首页');
  });

  test(`${platform} 关机补查保持平台冷却、重试与暂停开关，不自动开启历史缓存`, async t => {
    let limited = true;
    const h = fixture(t, platform, (_, { raw }) => { if (limited) throw new CaptureError('limited', '限流', 180000); return { items: [raw(2, 80), raw(90, 58)], end: true }; });
    await h.restart(); await h.tick();
    const retry = h.store.job(h.id).checkpoint.retryAt;
    await h.restart(); await h.tick();
    assert.equal(h.requests.length, 1); assert.equal(h.store.job(h.id).checkpoint.retryAt, retry);
    h.store.setSetting('targetEnabled:' + h.key, false);
    h.setTime(retry + 1); await h.tick(); assert.equal(h.requests.length, 1);
    h.store.setSetting('targetEnabled:' + h.key, true); limited = false;
    await h.finish();
    assert.equal(h.store.jobs().find(j => j.uid === h.key && j.kind === 'history').status, 'paused');
  });
}

for (const platform of ['weibo', 'xueqiu']) test(`${platform} 停用的博主与手动暂停的更新任务重开后仍不请求`, async t => {
  const h = fixture(t, platform, () => { throw Error('不应采集'); });
  h.store.updateJob(h.id, { status: 'paused' });
  await h.restart(); await h.tick();
  assert.equal(h.store.job(h.id).status, 'paused'); assert.equal(h.requests.length, 0);
  h.store.updateJob(h.id, { status: 'queued' });
  h.store.setSetting('platformEnabled:' + platform, false);
  await h.restart(); await h.tick(); assert.equal(h.requests.length, 0);
  h.store.setSetting('platformEnabled:' + platform, true);
  h.store.setAccount({ status: 'needs_login' }, platform);
  await h.restart(); await h.tick(); assert.equal(h.requests.length, 0);
});

test('补查被平台可见范围截断，说明当前可见范围，不声称找回已删内容', async t => {
  const h = fixture(t, 'weibo', (_, { raw }) => ({ items: [raw(2, 150)], end: true, endMessage: '仅能查看部分内容' }));
  await h.restart(); await h.finish();
  assert.equal(h.store.count(), 2);
  assert.match(h.store.job(h.id).message, /当前可见/);
  assert.doesNotMatch(h.store.job(h.id).message, /全部历史|找回已删/);
});

for (const platform of ['weibo', 'xueqiu']) test(`${platform} 普通检查保留晚出现的动态，检查水位不被误用为发布时间过滤器`, async t => {
  const h = fixture(t, platform, (_, { raw }) => ({ items: [raw(100, 59), raw(101, 58)], end: false }));
  await h.tick(); await h.finish();
  assert.ok(h.store.hasPost(platform === 'weibo' ? '101' : 'xueqiu:101'));
  assert.equal(h.requests.length, 1);
});
