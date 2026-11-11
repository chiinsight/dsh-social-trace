import { existsSync, mkdirSync, renameSync, unlinkSync, statSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { configFor } from './config.js';
import { mediaURL } from './data.js';

export function runProcess(program, args, { signal, threads = 2, timeout = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { shell: false, signal, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads), HF_HUB_OFFLINE: '1', MODELSCOPE_OFFLINE: '1' } });
    let output = '', exceeded = false;
    const timer = setTimeout(() => { exceeded = true; child.kill('SIGKILL'); }, timeout); timer.unref();
    const abort = () => child.kill('SIGKILL'); signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 1000000) { exceeded = true; child.kill('SIGKILL'); } });
    child.stderr.resume(); // Do not store paths, media URLs, or model diagnostics in public errors.
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(Object.assign(new Error('本地处理程序不可用，请检查 Python、ffmpeg 与模型配置'), { setup: error.code === 'ENOENT' })); });
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', abort); code === 0 && !exceeded ? resolve(output) : reject(Object.assign(new Error(exceeded ? '本地处理超时或输出过大，可稍后重试' : code === 78 ? '转写环境缺少 PyTorch 或 FunASR，请配置已安装依赖的 Python' : '本地处理未成功，请检查依赖、模型和媒体文件'), { setup: code === 78 })); });
  });
}

export function videoView(row) {
  if (!row) return null;
  const metadata = JSON.parse(row.metadata), summary = JSON.parse(row.summary);
  return { durationMs: metadata.durationMs, imagePost: metadata.imagePost, summary, transcript: row.transcript,
    stages: { video: row.video_status, audio: row.audio_status, transcription: row.transcript_status },
    videoAvailable: row.video_status === 'done', audioAvailable: row.audio_status === 'done', error: row.error, updatedAt: row.updated_at };
}

export class VideoLibrary {
  constructor(getStore, getDocuments, { fetchImpl = fetch, processImpl = runProcess } = {}) {
    this.getStore = getStore; this.getDocuments = getDocuments; this.fetchImpl = fetchImpl; this.processImpl = processImpl;
    this.busy = null; this.controller = null; this.timer = null; this.closed = false;
  }
  get store() { return this.getStore(); }
  recover() { this.store.db.exec("UPDATE video_records SET video_status=CASE WHEN video_status='running' THEN 'queued' ELSE video_status END,audio_status=CASE WHEN audio_status='running' THEN 'queued' ELSE audio_status END,transcript_status=CASE WHEN transcript_status='running' THEN 'queued' ELSE transcript_status END"); }
  configure(uid = '') {
    const rows = this.store.db.prepare('SELECT * FROM video_records WHERE (?=\'\' OR uid=?)').all(uid, uid);
    for (const row of rows) {
      const config = configFor(this.store, row.uid), metadata = JSON.parse(row.metadata);
      for (const [column, enabled] of [['video_status', config.saveVideo], ['audio_status', config.saveAudio], ['transcript_status', config.transcribe]]) {
        if (enabled && !metadata.imagePost && row[column] === 'not_requested') this.patch(row.post_id, { [column]: 'queued' });
        if (!enabled && ['queued', 'running'].includes(row[column])) this.patch(row.post_id, { [column]: 'not_requested' });
      }
    }
    this.cancelInactive();
  }
  canRun(row) {
    const target = this.store.target(row.uid), account = this.store.account('douyin');
    return !this.closed && target && this.store.monitoringEnabled('douyin', row.uid) && account?.status === 'ready' && account.cooldown_until <= Date.now()
      && this.store.jobs().some(job => job.uid === row.uid && job.kind === (row.capture_kind === 'history' ? 'history' : 'updates') && ['queued', 'complete'].includes(job.status));
  }
  cancelInactive() {
    if (this.active && (!this.canRun(this.active) || !configFor(this.store, this.active.uid)[this.activeOption])) this.controller?.abort();
  }
  patch(id, patch) {
    const allowed = ['video_status', 'audio_status', 'transcript_status', 'transcript', 'error', 'search_text'];
    const entries = Object.entries(patch);
    if (entries.some(([key]) => !allowed.includes(key))) throw new Error('无效的视频状态');
    this.store.db.prepare('UPDATE video_records SET ' + entries.map(([key]) => key + '=?').join(',') + ',updated_at=? WHERE post_id=?').run(...entries.map(([, value]) => value), Date.now(), id);
  }
  paths(row) {
    const id = row.post_id.replace(/^douyin:/, '');
    if (!/^\d{5,30}$/.test(id)) throw new Error('作品标识无效');
    const directory = join(this.getDocuments().authorDirectory(row.uid), 'media', id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return { directory, video: join(directory, 'video.mp4'), audio: join(directory, 'audio.wav') };
  }
  retry(id) {
    const row = this.store.db.prepare('SELECT * FROM video_records WHERE post_id=?').get(id);
    if (!row) throw new Error('视频记录不存在');
    const config = configFor(this.store, row.uid), paths = this.paths(row);
    for (const type of ['video', 'audio']) if (config[type === 'video' ? 'saveVideo' : 'saveAudio'] && row[type + '_status'] === 'done' && !existsSync(paths[type])) this.patch(id, { [type + '_status']: 'queued' });
    for (const column of ['video_status', 'audio_status', 'transcript_status']) if (['failed', 'needs_setup'].includes(row[column]) && config[{ video_status: 'saveVideo', audio_status: 'saveAudio', transcript_status: 'transcribe' }[column]]) this.patch(id, { [column]: 'queued', error: '' });
  }
  async download(url, destination, maxBytes, signal) {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!mediaURL(url)) throw new Error('媒体地址不属于允许的平台域名');
      const response = await this.fetchImpl(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]), headers: { Referer: 'https://www.douyin.com/' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel(); url = new URL(response.headers.get('location'), url).href; continue;
      }
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('媒体下载未成功或超过大小上限；地址可能已过期'); }
      const temporary = destination + '.' + randomUUID() + '.part'; let length = 0, head = Buffer.alloc(0);
      try {
        const cap = new Transform({ transform(chunk, encoding, callback) { length += chunk.length; if (head.length < 64) head = Buffer.concat([head, chunk.subarray(0, 64 - head.length)]); callback(length > maxBytes ? new Error('媒体超过大小上限') : null, chunk); } });
        await pipeline(Readable.fromWeb(response.body), cap, createWriteStream(temporary, { mode: 0o600 }), { signal });
        signal.throwIfAborted();
        if (head.subarray(4, 8).toString() !== 'ftyp') throw new Error('未获取到可确认的 MP4 文件，不当成下载成功');
        if (length < 1024) throw new Error('媒体内容过小，未当成下载成功');
        renameSync(temporary, destination); return;
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    throw new Error('媒体重定向次数过多');
  }
  tick() {
    if (this.closed || this.suspended || this.busy) return this.busy;
    const rows = this.store.db.prepare("SELECT v.* FROM video_records v JOIN jobs j ON j.uid=v.uid AND j.kind=CASE WHEN v.capture_kind='history' THEN 'history' ELSE 'updates' END WHERE (v.video_status='queued' OR v.audio_status='queued' OR v.transcript_status='queued') AND j.status IN ('queued','complete') AND NOT EXISTS (SELECT 1 FROM settings WHERE key='targetEnabled:'||v.uid AND value='false') ORDER BY v.updated_at,v.post_id LIMIT 100").all();
    const row = rows.find(row => this.canRun(row) && (configFor(this.store, row.uid).saveVideo && row.video_status === 'queued' || configFor(this.store, row.uid).saveAudio && row.audio_status === 'queued' || configFor(this.store, row.uid).transcribe && row.transcript_status === 'queued'));
    if (!row) return;
    this.active = row; this.controller = new AbortController();
    this.busy = this.process(row, this.controller.signal).finally(() => { this.busy = null; this.active = null; this.controller = null; });
    return this.busy;
  }
  async process(row, signal) {
    const config = configFor(this.store, row.uid), metadata = JSON.parse(row.metadata);
    let paths;
    const column = config.saveVideo && row.video_status === 'queued' ? 'video_status' : config.saveAudio && row.audio_status === 'queued' ? 'audio_status' : config.transcribe && row.transcript_status === 'queued' ? 'transcript_status' : null;
    if (!column) return;
    this.activeOption = { video_status: 'saveVideo', audio_status: 'saveAudio', transcript_status: 'transcribe' }[column];
    const current = () => { signal.throwIfAborted(); if (!this.canRun(row) || !configFor(this.store, row.uid)[this.activeOption]) throw new Error('paused'); };
    this.patch(row.post_id, { [column]: 'running', error: '' });
    let temporaryVideo = null, temporaryAudio = null;
    try {
      current(); paths = this.paths(row);
      if (column === 'transcript_status' && (!config.modelPath || !existsSync(join(config.modelPath, 'model.pt')))) throw Object.assign(new Error('请先配置已下载的 SenseVoice 模型目录；不会自动下载大型模型'), { setup: true });
      if (column !== 'video_status' && (!metadata.durationMs || metadata.durationMs > 3600000)) throw new Error('音频或转写仅支持时长明确且不超过一小时的作品');
      let video = paths.video;
      if (!(column === 'transcript_status' && row.audio_status === 'done' && existsSync(paths.audio)) && !(row.video_status === 'done' && existsSync(paths.video))) {
        if (!metadata.videoURL) throw new Error('本次未获取到视频下载地址，等待下次正常检查后重试');
        if (column !== 'video_status') video = temporaryVideo = join(paths.directory, randomUUID() + '.mp4');
        await this.download(metadata.videoURL, video, config.maxFileMB * 1024 * 1024, signal); current();
      }
      if (column === 'video_status') this.patch(row.post_id, { video_status: 'done' });
      else {
        let audio = paths.audio;
        if (!(row.audio_status === 'done' && existsSync(audio))) {
          audio = temporaryAudio = join(paths.directory, randomUUID() + '.wav');
          await this.processImpl(config.ffmpeg, ['-nostdin', '-v', 'error', '-threads', String(config.threads), '-protocol_whitelist', 'file,pipe', '-i', video, '-vn', '-ac', '1', '-ar', '16000', audio], { signal, threads: config.threads });
          current();
          if (!existsSync(audio) || statSync(audio).size < 44) throw new Error('音轨提取未生成有效文件');
        }
        if (column === 'audio_status') { if (audio !== paths.audio) { renameSync(audio, paths.audio); temporaryAudio = null; } this.patch(row.post_id, { audio_status: 'done' }); }
        else {
          if (metadata.durationMs > 3600000) throw new Error('单个视频超过一小时，请分段处理后再转写');
          const output = await this.processImpl(config.python, [fileURLToPath(new URL('./transcribe.py', import.meta.url)), audio, config.modelPath, String(config.threads)], { signal, threads: config.threads });
          current(); const text = JSON.parse(output).text;
          if (typeof text !== 'string' || !text.trim() || text.length > 200000) throw new Error('转写结果为空或超过长度上限');
          this.patch(row.post_id, { transcript: text, transcript_status: 'done', search_text: row.search_text + '\n' + text });
        }
      }
    } catch (error) {
      if (signal.aborted || !this.canRun(row)) this.patch(row.post_id, { [column]: configFor(this.store, row.uid)[this.activeOption] ? 'queued' : 'not_requested' });
      else this.patch(row.post_id, { [column]: error.setup ? 'needs_setup' : 'failed', error: error.setup ? error.message : '媒体处理未完成，请检查文件大小、下载地址或本地依赖后重试' });
    } finally {
      for (const file of [temporaryVideo, temporaryAudio].filter(Boolean)) if (existsSync(file)) unlinkSync(file);
      const post = this.store.posts({ ids: [row.post_id], limit: 1 })[0]; if (post) this.getDocuments().save({ ...post, publishedAt: post.published_at });
    }
  }
  start() { if (this.timer) return; this.closed = false; this.recover(); this.timer = setInterval(() => { void this.tick()?.catch(() => {}); }, 5000); this.timer.unref(); }
  async close() { this.closed = true; clearInterval(this.timer); this.controller?.abort(); if (this.busy) await this.busy; }
}
