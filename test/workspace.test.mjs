import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createRuntime } from '../lib/index.js';
import { Documents } from '../lib/documents.js';
import { Store } from '../lib/store.js';

const uid = '1234567890';
const post = (id = '1') => ({ id, uid, author: '测试博主', publishedAt: Date.parse('2026-11-05T01:00:00Z'),
  text: '工作文件夹中的正文', url: `https://example.test/${id}`, quote: null, complete: true, raw: {} });
class LocalAdapter {
  constructor() { this.id = 'weibo'; this.name = '微博'; }
  normalizePost(value) { return value; }
  isPinned() { return false; }
  async timeline() { return { items: [post('2')], end: true }; }
  async complete(value) { return value; }
  async close() {}
}

async function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'social-trace-workspace-')));
  const privateDirectory = join(root, 'private'); mkdirSync(privateDirectory);
  const chosen = join(root, '用户选择的 工作文件夹');
  const options = { adapterFactories: { weibo: LocalAdapter }, chooseFolder: async () => chosen };
  const runtime = createRuntime(privateDirectory, options);
  const server = createServer(runtime.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/dsh-social-trace`;
  const send = (path, body = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify(body) });
  return { root, privateDirectory, chosen, options, runtime, send, state: async () => (await fetch(base + '/status')).json() };
}

test('历史缓存自然完成后继续保存最后一批图片，手动暂停和总控仍能阻止备份', async t => {
  const h = await setup(t), store = h.runtime.store;
  store.addTarget(uid);
  store.setAccount({ status: 'ready', cooldown_until: 0 });
  for (const job of store.jobs()) store.updateJob(job.id, { status: job.kind === 'history' ? 'complete' : 'paused' });
  const documents = new Documents(store, h.privateDirectory);
  const calls = [];
  documents.image = async (_, url) => { calls.push(url); return {}; };
  const value = { ...post('final-image'), images: ['https://wx1.sinaimg.cn/final.jpg'], captureKind: 'history' };
  documents.enqueueImages(value, 'history');
  await documents.drainImages();
  assert.equal(calls.length, 1);
  assert.equal(documents.imageQueue.size, 0);
  store.setSetting('monitorEnabled', false);
  assert.equal(documents.canBackupImages(value), false);
  store.setSetting('monitorEnabled', true);
  store.updateJob(store.jobs().find(job => job.kind === 'history').id, { status: 'paused' });
  assert.equal(documents.canBackupImages(value), false);
});

test('工作文件夹选择、资料迁移、自动文档写入和重启恢复', async t => {
  const h = await setup(t);
  h.runtime.store.addTarget(uid);
  h.runtime.store.savePost(post());
  h.runtime.store.setAccount({ status: 'paused', reason: '保留暂停', cooldown_until: 12345 });
  const jobs = h.runtime.store.jobs().map(job => job.id);
  mkdirSync(join(h.privateDirectory, 'weibo-browser'));
  writeFileSync(join(h.privateDirectory, 'weibo-browser', 'session-marker'), 'private-session');
  assert.equal((await (await h.send('/workspace/pick')).json()).directory, h.chosen);
  const response = await h.send('/workspace', { directory: h.chosen });
  assert.equal(response.status, 200);
  assert.equal((await h.state()).storage.workspaceDirectory, h.chosen);
  assert.equal(h.runtime.store.count(), 1);
  assert.deepEqual(h.runtime.store.jobs().map(job => job.id), jobs);
  assert.equal(h.runtime.store.account().reason, '保留暂停');
  assert.equal(h.runtime.store.account().cooldown_until, 12345);
  const folder = join(h.chosen, 'documents', 'weibo', uid);
  assert.equal(readdirSync(folder).length, 1);
  assert.match(readFileSync(join(folder, readdirSync(folder)[0]), 'utf8'), /工作文件夹中的正文/);
  assert.equal(existsSync(join(h.chosen, 'weibo-browser')), false);
  assert.equal(readFileSync(join(h.privateDirectory, 'weibo-browser', 'session-marker'), 'utf8'), 'private-session');

  // New captures use the moved database and write documents into the chosen folder.
  h.runtime.store.setAccount({ status: 'ready', cooldown_until: 0 });
  const updates = h.runtime.store.jobs().find(job => job.kind === 'updates'); h.runtime.store.updateJob(updates.id, { status: 'paused' });
  for (let i = 0; i < 3; i++) await h.runtime.worker.tick();
  assert.equal(h.runtime.store.count(), 2);
  assert.equal(readdirSync(folder).length, 2);
  const old = new DatabaseSync(join(h.privateDirectory, 'archive.sqlite'), { readOnly: true });
  assert.equal(old.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1); old.close();
  await h.runtime.close();
  const reopened = createRuntime(h.privateDirectory, h.options);
  try {
    assert.equal(reopened.store.count(), 2);
    assert.equal(reopened.documents.directory, join(h.chosen, 'documents'));
  } finally { await reopened.close(); }
});

test('拒绝覆盖已有资料库及无效路径，失败时继续使用原工作文件夹', async t => {
  const h = await setup(t);
  h.runtime.store.addTarget(uid); h.runtime.store.savePost(post());
  mkdirSync(h.chosen); writeFileSync(join(h.chosen, 'archive.sqlite'), '不要覆盖');
  assert.equal((await h.send('/workspace', { directory: h.chosen })).status, 400);
  assert.equal(readFileSync(join(h.chosen, 'archive.sqlite'), 'utf8'), '不要覆盖');
  assert.equal((await h.send('/workspace', { directory: '../relative' })).status, 400);
  const file = join(h.root, 'ordinary-file'); writeFileSync(file, '保留');
  assert.equal((await h.send('/workspace', { directory: file })).status, 400);
  assert.equal((await h.state()).storage.workspaceDirectory, h.privateDirectory);
  assert.equal(h.runtime.store.count(), 1);
});

test('配置保存失败时回退原库，不留下可被误用的目标数据库', async t => {
  const h = await setup(t);
  h.runtime.store.addTarget(uid); h.runtime.store.savePost(post());
  mkdirSync(join(h.privateDirectory, 'workspace.json'));
  assert.equal((await h.send('/workspace', { directory: h.chosen })).status, 400);
  assert.equal(h.runtime.store.count(), 1);
  assert.equal(h.runtime.worker.suspended, false);
  assert.equal(existsSync(join(h.chosen, 'archive.sqlite')), false);
  assert.equal((await h.state()).storage.workspaceDirectory, h.privateDirectory);
});

test('文档写入失败不丢失入库正文，可修复目录后重试', t => {
  const root = mkdtempSync(join(tmpdir(), 'social-trace-documents-'));
  const store = new Store(root);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  store.addTarget(uid); store.savePost(post());
  writeFileSync(join(root, 'documents'), '这是文件，不是目录');
  const documents = new Documents(store, root);
  assert.equal(documents.save(post()), false);
  assert.equal(store.count(), 1);
  assert.match(documents.error, /文档写入失败/);
  rmSync(join(root, 'documents'));
  assert.equal(documents.save(post()), true);
  assert.equal(documents.error, '');
  assert.equal(readdirSync(join(root, 'documents', 'weibo', uid)).length, 1);
});

test('图片按平台与博主独立备份，可离线读取，并保留旧目录里的文件', async t => {
  const root = mkdtempSync(join(tmpdir(), 'social-trace-media-'));
  const store = new Store(root);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; store.close(); rmSync(root, { recursive: true }); });
  const image = 'https://wx1.sinaimg.cn/large/test.jpg';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
  globalThis.fetch = async () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
  store.addTarget(uid); store.addTarget(uid, uid, Date.now(), 'xueqiu');
  mkdirSync(join(root, 'documents', uid), { recursive: true });
  writeFileSync(join(root, 'documents', uid, '保留.txt'), '旧文件');
  const documents = new Documents(store, root);
  for (const key of [uid, 'xueqiu:' + uid]) {
    const value = { ...post(key), uid: key, images: [key.startsWith('xueqiu:') ? 'https://xqimg.imedao.com/test.jpg' : image] };
    assert.equal(documents.save(value), true);
    await documents.cacheImages(value);
  }
  const weibo = join(root, 'documents', 'weibo', uid), xueqiu = join(root, 'documents', 'xueqiu', uid);
  assert.equal(readFileSync(join(weibo, '保留.txt'), 'utf8'), '旧文件');
  assert.equal(existsSync(join(root, 'documents', uid)), false);
  assert.equal(readdirSync(join(weibo, 'images')).length, 1);
  assert.equal(readdirSync(join(xueqiu, 'images')).length, 1);
  globalThis.fetch = async () => { throw new Error('断网'); };
  assert.equal((await documents.image(uid, image)).type, 'image/png');
});

test('启动补写使用持久化增量游标；重开不重写旧文档，同毫秒的新文档不漏掉', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-doc-cursor-'));
  let store = new Store(directory); store.addTarget(uid);
  let documents = new Documents(store, directory);
  t.after(async () => { documents.stopping = true; if (documents.queueTask) await documents.queueTask; store.close(); rmSync(directory, { recursive: true, force: true }); });
  store.savePost(post('1'), 1000); store.savePost(post('2'), 1000);
  await documents.sync({ incremental: true });
  const first = join(documents.authorDirectory(uid), '2026-11-05-1.md');
  writeFileSync(first, '保留用户的旧文档');
  let writes = 0; const save = documents.save.bind(documents);
  documents.save = (...args) => { writes++; return save(...args); };
  await documents.sync({ incremental: true }); assert.equal(writes, 0);
  store.savePost(post('3'), 1000);
  await documents.sync({ incremental: true }); assert.equal(writes, 1);
  assert.equal(readFileSync(first, 'utf8'), '保留用户的旧文档');
  store.close(); store = new Store(directory); documents = new Documents(store, directory);
  await documents.sync({ incremental: true });
  assert.equal(readFileSync(first, 'utf8'), '保留用户的旧文档');
  assert.equal(store.getSetting('documentsCursor').id, '3');
  const query = store.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM posts WHERE (last_seen_at,id)>(?,?) ORDER BY last_seen_at,id LIMIT 100').all(1000, '3');
  assert.ok(query.some(row => /SEARCH.*posts_modified/.test(row.detail)));
});

test('配图队列单路运行、更新优先；总控暂停时不下载，队列超过上限会提示而不膨胀', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-image-queue-'));
  const store = new Store(directory); store.addTarget(uid); store.setAccount({ status: 'ready' });
  const documents = new Documents(store, directory);
  t.after(async () => { documents.stopping = true; if (documents.queueTask) await documents.queueTask; store.close(); rmSync(directory, { recursive: true, force: true }); });
  let requests = 0, concurrent = 0, peak = 0;
  documents.image = async () => { requests++; concurrent++; peak = Math.max(peak, concurrent); await Promise.resolve(); concurrent--; return {}; };
  const picture = id => ({ ...post(String(id)), images: ['https://wx1.sinaimg.cn/' + id + '.jpg'] });
  documents.enqueueImages(picture(1), 'history');
  if (documents.queueTask) await documents.queueTask;
  assert.equal(requests, 0, '更新任务到期时先处理更新');
  store.jobs().forEach(job => store.updateJob(job.id, { status: 'paused' }));
  await documents.drainImages();
  assert.equal(requests, 0, '两个任务关闭后不继续后台配图');
  store.updateJob(store.jobs().find(job => job.kind === 'history').id, { status: 'queued', next_run_at: Date.now() + 60000 });
  await documents.drainImages();
  assert.equal(requests, 1); assert.equal(peak, 1);
  store.setSetting('monitorEnabled', false);
  for (let i = 2; i < 70; i++) documents.enqueueImages(picture(i));
  if (documents.queueTask) await documents.queueTask;
  assert.equal(requests, 1); assert.equal(documents.imageQueue.size, 32);
  assert.equal(store.getSetting('mediaBackupPending'), true);
});

test('关闭总控后保存/切换工作文件夹和重试文档不偷偷下载图片，明确重试图片才允许', async t => {
  const h = await setup(t);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
  globalThis.fetch = async (url, options) => String(url).startsWith('https://wx1.sinaimg.cn/') ? (calls++, new Response(png)) : originalFetch(url, options);
  t.after(() => { globalThis.fetch = originalFetch; });
  h.runtime.store.addTarget(uid); h.runtime.store.setSetting('monitorEnabled', false);
  h.runtime.store.savePost({ ...post('1'), raw: { pics: [{ large: { url: 'https://wx1.sinaimg.cn/test.jpg' } }] } }, Date.now(), 'history');
  assert.equal((await h.send('/workspace', { directory: h.chosen })).status, 200);
  assert.equal((await h.send('/workspace', { directory: h.chosen })).status, 200);
  assert.equal((await h.send('/workspace/sync')).status, 200);
  assert.equal(calls, 0);
  assert.equal((await h.send('/workspace/sync', { images: true })).status, 200);
  assert.equal(calls, 1);
  assert.equal(h.runtime.store.getSetting('monitorEnabled'), false);
});

test('后台配图异常不会成为未处理拒绝，待备份内容保留且可提示重试', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-image-error-'));
  const store = new Store(directory); store.addTarget(uid);
  store.jobs().forEach(job => store.updateJob(job.id, { status: 'paused' }));
  store.setAccount({ status: 'ready' });
  store.updateJob(store.jobs().find(job => job.kind === 'history').id, { status: 'queued', next_run_at: Date.now() + 60000 });
  const documents = new Documents(store, directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  documents.cacheImages = async () => { throw new Error('模拟后台磁盘故障'); };
  documents.enqueueImages({ ...post('1'), images: ['https://wx1.sinaimg.cn/example.jpg'] }, 'history');
  await documents.queueTask;
  assert.equal(documents.imageQueue.size, 1);
  assert.match(documents.mediaError, /中断.*正文已保留/);
});
