import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { imageReferer } from './text.js';

const types = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const limit = 2 * 1024 * 1024;

export class Avatars {
  constructor(directory, fetchImage = fetch) {
    this.directory = directory;
    this.fetchImage = fetchImage;
    this.pending = new Map();
    this.controller = new AbortController();
  }

  get(image) {
    if (!this.pending.has(image)) {
      const task = this.load(image).finally(() => this.pending.delete(image));
      this.pending.set(image, task);
    }
    return this.pending.get(image);
  }

  async load(image) {
    const file = join(this.directory, createHash('sha256').update(image).digest('hex') + '.avatar');
    try {
      const cached = await readFile(file);
      const end = cached.indexOf(10);
      const type = cached.subarray(0, end).toString();
      if (end > 0 && types.has(type) && cached.length > end + 1 && cached.length <= limit + end + 1) return { type, bytes: cached.subarray(end + 1) };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const response = await this.fetchImage(image, { headers: { Referer: imageReferer(image) }, redirect: 'error',
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]) });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !types.has(type) || Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error('头像暂时无法读取');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw new Error('头像文件过大');
      chunks.push(chunk);
    }
    if (!length) throw new Error('头像内容为空');
    const bytes = Buffer.concat(chunks, length);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, Buffer.concat([Buffer.from(type + '\n'), bytes]), { mode: 0o600 });
      await rename(temporary, file);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return { type, bytes };
  }

  async close() {
    this.controller.abort();
    await Promise.allSettled(this.pending.values());
  }
}
