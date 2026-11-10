// A live, rebuildable view of saved facts, not an AI-generated viewpoint Wiki.
export function authorIndex(store, uid, now) {
  const target = store.target(uid);
  if (!target) throw new Error('博主不存在，请先查询准确 ID');
  const summary = store.db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(complete=1),0) AS complete, COALESCE(SUM(quote IS NULL),0) AS original,
    COALESCE(SUM(quote IS NOT NULL),0) AS repost,
    MIN(published_at) AS firstPublishedAt, MAX(published_at) AS latestPublishedAt,
    MAX(first_seen_at) AS latestSavedAt FROM posts WHERE uid=?`).get(uid);
  const days = store.db.prepare(`SELECT date(published_at/1000,'unixepoch','+8 hours') AS date,
    COUNT(*) AS total, SUM(complete=1) AS complete FROM posts WHERE uid=? GROUP BY date ORDER BY date DESC LIMIT 30`).all(uid);
  const recent = store.db.prepare('SELECT id,published_at AS publishedAt,complete FROM posts WHERE uid=? ORDER BY published_at DESC,id DESC LIMIT 20').all(uid);
  return { version: 1, generatedAt: now, uid, author: target.name, platform: target.platform,
    scope: 'local_saved_posts_only', ...summary, incomplete: summary.total - summary.complete,
    days, daysTruncated: summary.total > days.reduce((sum, day) => sum + day.total, 0), recent,
    note: '仅本地数量和时间索引，不证明观点；recent 最多20条、days 最多30个有记录的日期。观点分析须继续查询原文；未保存不代表未发布。' };
}
