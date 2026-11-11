import { plainText } from '../../plain-text.js';

export const contentRetryDelays = [60000, 300000, 1800000];

export function contentProblem(error, job) {
  if (error.kind !== 'content' && !(error.kind === 'schema' && /长文接口未返回全文/.test(error.message || ''))) return null;
  const root = job.checkpoint.pending?.[0];
  if (!root) return null;
  const post = [root, root.retweeted_status].filter(Boolean).find(post => String(post.idstr || post.id) === String(error.postId))
    || [root, root.retweeted_status].filter(Boolean).find(post => post.isLongText && !post.longTextContent) || root;
  const postId = String(post.idstr || post.id || ''), rootId = String(root.idstr || root.id || '');
  if (!/^\d{5,30}$/.test(postId) || !/^\d{5,30}$/.test(rootId)) return null;
  const publishedAt = new Date(post.created_at).getTime();
  return { type: 'full_text', postId, rootId, url: 'https://weibo.com/detail/' + postId,
    author: plainText(post.user?.screen_name || ''), excerpt: plainText(post.text_raw || post.text || '').slice(0, 140),
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : null, stage: post === root ? '微博正文' : '转发引用的原文' };
}
