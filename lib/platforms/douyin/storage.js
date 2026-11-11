import { configFor } from './config.js';
import { videoView } from './library.js';

export function initializeStorage(store) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS video_records (
      post_id TEXT PRIMARY KEY REFERENCES posts(id),uid TEXT NOT NULL REFERENCES targets(uid),metadata TEXT NOT NULL,summary TEXT NOT NULL,
      transcript TEXT NOT NULL DEFAULT '',search_text TEXT NOT NULL DEFAULT '',capture_kind TEXT NOT NULL DEFAULT 'updates',
      video_status TEXT NOT NULL DEFAULT 'not_requested',audio_status TEXT NOT NULL DEFAULT 'not_requested',transcript_status TEXT NOT NULL DEFAULT 'not_requested',
      error TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS video_owner ON video_records(uid);`);
}

export function saveMedia(store, post, now = Date.now(), captureKind = 'updates') {
    if (!post.video || store.target(post.uid)?.platform !== 'douyin') return;
    const options = configFor(store, post.uid), previous = store.db.prepare('SELECT * FROM video_records WHERE post_id=?').get(post.id);
    const summary = options.platformAI ? post.video.summary : previous ? JSON.parse(previous.summary) : { status: 'disabled', abstract: '', chapters: [], origin: 'platform_ai' };
    const metadata = { durationMs: post.video.durationMs, imagePost: post.video.imagePost, videoURL: post.video.videoURL };
    const search = [summary.abstract, ...(summary.chapters || []).map(chapter => chapter.title + ' ' + chapter.text), previous?.transcript || ''].join('\n');
    store.db.prepare(`INSERT INTO video_records(post_id,uid,metadata,summary,search_text,capture_kind,video_status,audio_status,transcript_status,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET metadata=excluded.metadata,summary=excluded.summary,search_text=excluded.search_text,updated_at=excluded.updated_at`)
      .run(post.id, post.uid, JSON.stringify(metadata), JSON.stringify(summary), search, captureKind || 'updates',
        !metadata.imagePost && options.saveVideo ? 'queued' : 'not_requested', !metadata.imagePost && options.saveAudio ? 'queued' : 'not_requested', !metadata.imagePost && options.transcribe ? 'queued' : 'not_requested', now);
}

export function preparePost(store, post) {
  return post.video && !configFor(store, post.uid).platformAI ? { ...post, raw: { ...post.raw, video: { ...post.video, summary: undefined } } } : post;
}

export function decoratePost(store, post) {
  return { video: videoView(store.db.prepare('SELECT * FROM video_records WHERE post_id=?').get(post.id)) };
}

export function filterPosts(kind) {
  return ['video', 'images'].includes(kind) ? { sql: "EXISTS (SELECT 1 FROM video_records v WHERE v.post_id=posts.id AND json_extract(v.metadata,'$.imagePost')=?)", values: [kind === 'images' ? 1 : 0] } : null;
}

export function searchPosts(value, literal) {
  return { sql: 'EXISTS (SELECT 1 FROM video_records v WHERE v.post_id=posts.id AND ' + (literal ? 'instr(v.search_text,?)>0' : "v.search_text LIKE ? ESCAPE '\\'") + ')', values: [value] };
}
