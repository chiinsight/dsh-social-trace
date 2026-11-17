import { content } from './index.js';
import { plainText } from '../../plain-text.js';

export const contentRetryDelays = [60000, 300000, 1800000];

export function contentProblem(error, job) {
  if (error.kind !== 'content' && !(error.kind === 'schema' && /雪球详情没有确认完整正文/.test(error.message || ''))) return null;
  const root = job.checkpoint.pending?.[0];
  if (!root) return null;
  const post = [root, root.retweeted_status].filter(Boolean).find(item => String(item.id) === String(error.postId))
    || [root, root.retweeted_status].filter(Boolean).find(item => !content(item).complete) || root;
  const postId = String(post.id || ''), rootId = String(root.id || ''), uid = String(root.user_id ?? root.user?.id ?? '');
  if (!/^\d{5,30}$/.test(postId) || !/^\d{5,30}$/.test(rootId) || !/^\d{5,20}$/.test(uid)) return null;
  const publishedAt = Number(post.created_at);
  return { type: 'full_text', postId, rootId, url: 'https://xueqiu.com/' + uid + '/' + postId,
    author: plainText(post.user?.screen_name || ''), excerpt: plainText(post.text || post.description || '').slice(0, 140),
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : null, stage: post === root ? '雪球正文' : '转发引用的原文' };
}