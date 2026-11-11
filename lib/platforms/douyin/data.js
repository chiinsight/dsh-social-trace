import { CaptureError } from '../../capture-error.js';
import { plainText } from '../../plain-text.js';
import { avatar, images, firstURL } from './media.js';
export { mediaURL, avatar, images } from './media.js';

export function parseAuthor(input) {
  const value = String(input || '').trim();
  if (/^MS4w[\w-]{16,180}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (['www.douyin.com', 'douyin.com'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port) {
      const match = /^\/user\/(MS4w[\w-]{16,180})\/?$/.exec(url.pathname);
      if (match) return match[1];
    }
  } catch {}
  throw new Error('请粘贴抖音博主完整主页链接（/user/…），或 sec_uid；抖音号不是内部用户ID');
}

export function normalizePost(raw, uid) {
  if (raw?.author?.sec_uid !== uid) return null;
  if (typeof raw.aweme_id !== 'string' || !/^\d{5,30}$/.test(raw.aweme_id)) throw new CaptureError('schema', '抖音作品ID无效，已停止以防记录错位');
  const publishedAt = Number(raw.create_time) * 1000;
  if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0) throw new CaptureError('schema', '抖音发布时间无效');
  const description = plainText(raw.desc || raw.caption || '') || (raw.images?.length ? '分享图片' : '视频作品');
  const chapters = (Array.isArray(raw.chapter_list) ? raw.chapter_list : []).slice(0, 200).map(chapter => ({
    atMs: Number.isSafeInteger(Number(chapter.timestamp)) && Number(chapter.timestamp) >= 0 ? Number(chapter.timestamp) : 0,
    title: plainText(chapter.desc || '').slice(0, 1000), text: plainText(chapter.detail || '').slice(0, 10000),
  }));
  const reviewed = Number(raw.chapter_review_status) === 2;
  const abstract = plainText(raw.chapter_abstract || '').slice(0, 20000);
  const video = { durationMs: Math.max(0, Number(raw.video?.duration) || 0),
    summary: { status: abstract || chapters.length ? reviewed ? 'available' : 'unconfirmed' : 'not_returned', abstract, chapters,
      reviewStatus: raw.chapter_review_status ?? null, origin: 'platform_ai' },
    videoURL: firstURL(raw.video?.play_addr) || firstURL(raw.video?.play_addr_h264),
    imagePost: !!raw.images?.length };
  return { id: raw.aweme_id, uid, author: plainText(raw.author.nickname || uid), publishedAt, text: description,
    url: `https://www.douyin.com/${video.imagePost ? 'note' : 'video'}/${raw.aweme_id}`, complete: true, quote: null,
    avatar: avatar(raw.author), images: images(raw), video,
    raw: { aweme_id: raw.aweme_id, create_time: raw.create_time, desc: description, author: { sec_uid: uid, nickname: raw.author.nickname }, images: raw.images || [], video } };
}

export function decodeList(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CaptureError('verification', '抖音未返回作品数据，请检查独立登录窗口');
  if (Number(body.status_code) !== 0 || !Array.isArray(body.aweme_list) || ![0, 1, false, true].includes(body.has_more)) throw new CaptureError('verification', '抖音未确认作品列表，可能需要登录或验证；不会当成没有更新');
  const cursor = String(body.max_cursor ?? '');
  if (body.has_more && !/^\d+$/.test(cursor)) throw new CaptureError('schema', '抖音分页游标缺失，断点已保留');
  return { items: body.aweme_list, end: !body.has_more, nextCursor: cursor,
    endMessage: body.has_more ? '' : '已到抖音当前可见作品末尾，不代表完整历史' };
}
