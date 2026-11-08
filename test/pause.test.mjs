import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { Worker } from '../lib/worker.js';
import { Documents } from '../lib/documents.js';
import { CaptureError } from '../lib/capture-error.js';

const uid = '1234567890';
const now = Date.parse('2026-11-06T10:00:00+08:00');
const switches = [
  ['总控', 'history', (s, j, on) => s.setSetting('monitorEnabled', on)],
  ['平台', 'history', (s, j, on) => s.setSetting('platformEnabled:weibo', on)],
  ['博主', 'history', (s, j, on) => s.setSetting('targetEnabled:' + uid, on)],
  ['新动态', 'updates', (s, j, on) => s.updateJob(j.id, { status: on ? 'queued' : 'paused' })],
  ['历史缓存', 'history', (s, j, on) => s.updateJob(j.id, { status: on ? 'queued' : 'paused' })],
  ['账号', 'history', (s, j, on) => s.setAccount({ status: on ? 'ready' : 'paused' })],
];

for (const [name, kind, toggle] of switches) {
  for (const phase of ['空闲', '资料返回', '资料失败', '时间线返回', '全文返回', '时间线失败', '全文失败']) {
    test(`${name}关闭：${phase}期间关闭不发后续请求、不推进断点或被错误恢复，开启后可继续`, async t => {
      const directory = mkdtempSync(join(tmpdir(), 'social-trace-pause-'));
      const store = new Store(directory);
      store.addTarget(uid, '测试博主', now - 10000); store.setAccount({ status: 'ready' });
      const job = store.jobs().find(j => j.kind === kind);
      for (const other of store.jobs().filter(j => j.id !== job.id)) store.updateJob(other.id, { status: 'paused' });
      const post = { id: '1', uid, author: '测试博主', text: '正文', url: 'https://weibo.com/u/' + uid, publishedAt: now - 1000, complete: true, quote: null, raw: {} };
      const bodyPhase = phase.startsWith('全文');
      if (phase.startsWith('资料')) store.db.prepare('UPDATE targets SET name=? WHERE uid=?').run(uid, uid);
      if (bodyPhase) store.updateJob(job.id, { checkpoint: { page: 1, pageLoaded: true, pending: [post] } });
      const before = store.job(job.id), notices = store.notices().length;
      let release, entered, time = now, requests = 0, writes = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      let worker;
      const request = async () => {
        await worker.beforeRequest(); requests++; entered();
        if (requests === 1) { await gate; if (phase.endsWith('失败')) throw new CaptureError('network', '关闭后的迟到网络错误'); }
      };
      worker = new Worker(store, { id: 'weibo', normalizePost: p => p, isPinned: () => false,
        ...(phase.startsWith('资料') ? { profile: async () => { await request(); return { name: '测试博主', total: 1, avatar: null }; } } : {}),
        timeline: async () => { await request(); return { items: [post], end: true }; },
        complete: async p => { await request(); return p; } }, { now: () => time,
        documents: { save: () => { writes++; return true; }, enqueueImages() {}, drainImages() {} } });
      t.after(async () => { release(); await worker.stop(); store.close(); rmSync(directory, { recursive: true, force: true }); });
      if (phase === '空闲') { toggle(store, job, false); await worker.tick(); }
      else { const task = worker.tick(); await started; toggle(store, job, false); release(); await task; }
      const count = requests;
      for (let i = 0; i < 3; i++) { time += 60001; await worker.tick(); }
      assert.equal(requests, count); assert.equal(count, phase === '空闲' ? 0 : 1);
      assert.deepEqual(store.job(job.id).checkpoint, before.checkpoint);
      assert.equal(store.job(job.id).pages, before.pages); assert.equal(store.job(job.id).saved, before.saved);
      assert.equal(store.job(job.id).status, name === '新动态' || name === '历史缓存' ? 'paused' : 'queued');
      assert.equal(store.count(), 0); assert.equal(writes, 0); assert.equal(store.account().errors, 0);
      assert.equal(store.notices().length, notices);
      if (name === '账号') assert.equal(store.account().status, 'paused');
      toggle(store, job, true); release();
      for (let i = 0; i < 5; i++) { time += 60001; await worker.tick(); }
      assert.equal(store.count(), 1); assert.equal(writes, 1);
      assert.equal(store.jobs().find(j => j.id !== job.id).status, 'paused');
    });
  }
}

test('后台图片按来源任务关闭；在途图片结束后不启动下一张，迟到错误不覆盖暂停，恢复后继续', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-image-pause-'));
  const store = new Store(directory); store.addTarget(uid); store.setAccount({ status: 'ready' });
  const documents = new Documents(store, directory);
  t.after(async () => { documents.stopping = true; if (documents.queueTask) await documents.queueTask; store.close(); rmSync(directory, { recursive: true, force: true }); });
  const history = store.jobs().find(j => j.kind === 'history');
  store.jobs().forEach(j => store.updateJob(j.id, { next_run_at: now + 10 ** 12 }));
  let calls = 0, release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  documents.image = async () => { calls++; entered(); if (calls === 1) { await gate; throw new Error('暂停后的迟到错误'); } };
  const notices = store.notices().length;
  const post = { id: '1', uid, images: ['https://wx1.sinaimg.cn/a.jpg', 'https://wx1.sinaimg.cn/b.jpg'] };
  documents.enqueueImages(post, 'history'); await started;
  store.updateJob(history.id, { status: 'paused' }); release(); await documents.queueTask;
  assert.equal(calls, 1); assert.equal(documents.imageQueue.size, 1);
  assert.equal(store.notices().length, notices); assert.equal(documents.mediaError, '');
  await documents.drainImages(); assert.equal(calls, 1);
  store.updateJob(history.id, { status: 'queued' });
  await documents.drainImages(); assert.equal(calls, 3); assert.equal(documents.imageQueue.size, 0);
  for (const [name, kind, toggle] of switches) {
    const job = store.jobs().find(j => j.kind === kind); toggle(store, job, false);
    documents.enqueueImages({ ...post, id: name }, kind); if (documents.queueTask) await documents.queueTask;
    const before = calls; await documents.drainImages(); assert.equal(calls, before);
    assert.equal(documents.imageQueue.has(name), true);
    documents.imageQueue.clear(); toggle(store, job, true);
  }
  const before = calls;
  store.setAccount({ cooldown_until: Date.now() + 60000 });
  documents.enqueueImages({ ...post, id: 'cooling' }, 'history'); await documents.queueTask;
  assert.equal(calls, before, '账号冷却时不继续后台配图');
});

test('配图任务来源在重开资料库后保留；历史暂停不被新动态运行绕过', t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-origin-'));
  let store = new Store(directory); store.addTarget(uid); store.setAccount({ status: 'ready' });
  store.savePost({ id: '1', uid, author: '测试', publishedAt: now, text: '正文', url: 'https://weibo.com', complete: true, raw: {} }, now, 'history');
  store.updateJob(store.jobs().find(j => j.kind === 'history').id, { status: 'paused' }); store.close();
  store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const documents = new Documents(store, directory), saved = store.posts()[0];
  assert.equal(saved.capture_kind, 'history');
  assert.equal(documents.canBackupImages({ ...saved, captureKind: saved.capture_kind }), false);
  assert.equal(store.jobs().find(j => j.kind === 'updates').status, 'queued');
});

test('所有开关和单任务暂停重开后保留，逐级恢复不解除下级暂停', t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-pause-reopen-'));
  let store = new Store(directory); store.addTarget(uid); store.setAccount({ status: 'ready' });
  for (const [, kind, toggle] of switches.slice(0, 5)) toggle(store, store.jobs().find(j => j.kind === kind), false);
  store.close(); store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.equal(store.monitoringEnabled('weibo', uid), false);
  for (const [, kind, toggle] of switches.slice(0, 3)) {
    toggle(store, store.jobs().find(j => j.kind === kind), true);
    assert.ok(store.jobs().every(j => j.status === 'paused'));
    assert.equal(store.dueJob(now + 100000), null);
  }
  assert.equal(store.monitoringEnabled('weibo', uid), true);
});

test('暂停后重开仍保留待下载图片队列，历史来源不被新动态绕过，恢复历史后续传', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-image-resume-'));
  let store = new Store(directory); store.addTarget(uid); store.setAccount({ status: 'ready' });
  const raw = { pic_ids: ['a'], pic_infos: { a: { large: { url: 'https://wx1.sinaimg.cn/a.jpg' } } } };
  const post = { id: '1', uid, author: '测试', publishedAt: now, text: '配图', url: 'https://weibo.com', complete: true, raw, images: ['https://wx1.sinaimg.cn/a.jpg'] };
  store.savePost(post, now, 'history');
  const history = store.jobs().find(j => j.kind === 'history');
  store.updateJob(history.id, { status: 'paused' });
  let documents = new Documents(store, directory); documents.enqueueImages(post, 'history'); await documents.queueTask;
  assert.deepEqual(store.getSetting('mediaQueueIds'), ['1']); store.close();
  store = new Store(directory); documents = new Documents(store, directory); let calls = 0;
  t.after(async () => { documents.stopping = true; if (documents.queueTask) await documents.queueTask; store.close(); rmSync(directory, { recursive: true, force: true }); });
  store.jobs().forEach(j => store.updateJob(j.id, { next_run_at: Date.now() + 60000 }));
  documents.image = async () => { calls++; };
  assert.equal(documents.imageQueue.size, 1); await documents.drainImages(); assert.equal(calls, 0);
  store.updateJob(history.id, { status: 'queued' }); await documents.drainImages();
  assert.equal(calls, 1); assert.deepEqual(store.getSetting('mediaQueueIds'), []);
});

test('插件停止时在途请求不推进断点，停止后不再发请求', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-plugin-stop-'));
  const store = new Store(directory); store.addTarget(uid, '测试'); store.setAccount({ status: 'ready' });
  const history = store.jobs().find(j => j.kind === 'history');
  store.jobs().filter(j => j.kind === 'updates').forEach(j => store.updateJob(j.id, { status: 'paused' }));
  let release, calls = 0;
  const worker = new Worker(store, { normalizePost: p => p, timeline: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const task = worker.tick(); const closing = worker.stop(); release({ items: [], end: true });
  await Promise.all([task, closing]); await worker.tick();
  assert.equal(calls, 1); assert.deepEqual(store.job(history.id).checkpoint, {});
  assert.equal(worker.running, false); assert.equal(worker.stopping, true);
});
