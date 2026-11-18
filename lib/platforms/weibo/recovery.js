import { plainText } from '../../plain-text.js';

export const contentRetryDelays = [60000, 300000, 1800000];

// 微博截断的 feed 文本必定以省略号（+全文链接）结尾；误标 isLongText 的完整博文没有该标记。
export function feedLooksTruncated(item) {
  const visible = plainText(item.text_raw || item.text || '');
  return !visible || /(?:…|\.{3})(?:\s*全文)?[\s\u200b-\u200f\ufeff]*$/.test(visible);
}

export function misflaggedFullText(job) {
  const issue = job.checkpoint.contentIssue, root = job.checkpoint.pending?.[0];
  if (issue?.type !== 'full_text' || !root) return false;
  const post = [root, root.retweeted_status].filter(Boolean).find(item => String(item.idstr || item.id) === String(issue.postId));
  return !!post && post.isLongText === true && !post.longTextContent && !feedLooksTruncated(post);
}

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
