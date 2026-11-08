import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Avatars } from '../lib/avatars.js';

const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
function directory(t) {
  const value = mkdtempSync(join(tmpdir(), 'social-trace-avatars-'));
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

test('头像只下载一次，并发请求合并；重开缓存后离线也能立即读取同一图片', async t => {
  const path = directory(t);
  let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const cache = new Avatars(path, async () => { calls++; await wait; return new Response(picture, { headers: { 'Content-Type': 'image/png' } }); });
  const jobs = Array.from({ length: 12 }, () => cache.get('https://tva1.sinaimg.cn/avatar.png'));
  release();
  for (const result of await Promise.all(jobs)) assert.deepEqual(result.bytes, picture);
  assert.equal(calls, 1);
  assert.equal((await cache.get('https://tva1.sinaimg.cn/avatar.png')).type, 'image/png');
  assert.equal(calls, 1);
  assert.equal(statSync(join(path, readdirSync(path)[0])).mode & 0o777, 0o600);
  await cache.close();
  const reopened = new Avatars(path, async () => { throw new Error('离线'); });
  assert.deepEqual((await reopened.get('https://tva1.sinaimg.cn/avatar.png')).bytes, picture);
  assert.equal(reopened.pending.size, 0);
  await reopened.close();
});

test('头像地址变化会下载新版，旧头像与新头像不混淆', async t => {
  let calls = 0;
  const cache = new Avatars(directory(t), async () => new Response(Buffer.from(String(++calls)), { headers: { 'Content-Type': 'image/jpeg' } }));
  const old = 'https://tva1.sinaimg.cn/old.jpg', current = 'https://tva1.sinaimg.cn/new.jpg';
  assert.equal((await cache.get(old)).bytes.toString(), '1');
  assert.equal((await cache.get(current)).bytes.toString(), '2');
  assert.equal((await cache.get(old)).bytes.toString(), '1');
  assert.equal((await cache.get(current)).bytes.toString(), '2');
  assert.equal(calls, 2);
  await cache.close();
});

test('失败响应不写头像缓存，不会把失败永久记住', async t => {
  const path = directory(t);
  let calls = 0;
  const cache = new Avatars(path, async () => ++calls === 1 ? new Response('登录页', { headers: { 'Content-Type': 'text/html' } }) : new Response(picture, { headers: { 'Content-Type': 'image/png' } }));
  await assert.rejects(cache.get('https://tva1.sinaimg.cn/avatar.png'));
  assert.equal(readdirSync(path).length, 0);
  assert.equal(cache.pending.size, 0);
  assert.deepEqual((await cache.get('https://tva1.sinaimg.cn/avatar.png')).bytes, picture);
  assert.equal(calls, 2);
  await cache.close();
});

test('未知长度的超大头像边读边限制，超过 2MB 即停止且不落盘', async t => {
  const path = directory(t);
  let cancelled = false;
  const cache = new Avatars(path, async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'image/png' } }));
  await assert.rejects(cache.get('https://tva1.sinaimg.cn/avatar.png'), /过大/);
  assert.equal(cancelled, true);
  assert.equal(readdirSync(path).length, 0);
  await cache.close();
});
