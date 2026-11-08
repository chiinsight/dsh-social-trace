import { activeDestinations } from './delivery-config.js';
import { intervalAt, nextBoundary } from './schedule.js';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { weiboAvatar, platformImages } from './text.js';

export class Store {
  constructor(directory) {
    const path = join(directory, 'archive.sqlite');
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY CHECK(id=1), status TEXT NOT NULL DEFAULT 'needs_login',
        reason TEXT NOT NULL DEFAULT '请先登录微博', uid TEXT,
        next_request_at INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO account(id) VALUES(1);
      CREATE TABLE IF NOT EXISTS platform_accounts (
        platform TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'needs_login',
        reason TEXT NOT NULL DEFAULT '请先登录平台', uid TEXT,
        next_request_at INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO platform_accounts(platform,reason) VALUES('xueqiu','请先登录雪球');
      CREATE TABLE IF NOT EXISTS targets (
        uid TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL,
        interval_ms INTEGER NOT NULL, history_gap_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES targets(uid), kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', checkpoint TEXT NOT NULL DEFAULT '{}',
        pages INTEGER NOT NULL DEFAULT 0, saved INTEGER NOT NULL DEFAULT 0,
        next_run_at INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
        UNIQUE(uid,kind)
      );
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES targets(uid), author TEXT NOT NULL,
        published_at INTEGER NOT NULL, text TEXT NOT NULL, url TEXT NOT NULL,
        quote TEXT, complete INTEGER NOT NULL, raw TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS posts_author_time ON posts(uid,published_at DESC);
      CREATE INDEX IF NOT EXISTS posts_modified ON posts(last_seen_at,id);
      CREATE INDEX IF NOT EXISTS posts_first_seen ON posts(first_seen_at);
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL,
        created_at INTEGER NOT NULL, read_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    `);
    this.db.exec(`CREATE TABLE IF NOT EXISTS social_deliveries (
      id TEXT PRIMARY KEY,post_id TEXT NOT NULL,uid TEXT NOT NULL,author TEXT NOT NULL,
      bot_id TEXT NOT NULL,target_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
      error TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,sent_at INTEGER,
      UNIQUE(post_id,bot_id,target_id));
      CREATE INDEX IF NOT EXISTS social_deliveries_pending ON social_deliveries(status,created_at);
      CREATE INDEX IF NOT EXISTS social_deliveries_recent ON social_deliveries(created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS social_deliveries_destination ON social_deliveries(bot_id,target_id,created_at DESC,id DESC);`);
    if (!this.db.prepare('PRAGMA table_info(social_deliveries)').all().some(column => column.name === 'message')) this.db.exec("ALTER TABLE social_deliveries ADD COLUMN message TEXT NOT NULL DEFAULT ''");
    if (!this.db.prepare('PRAGMA table_info(social_deliveries)').all().some(column => column.name === 'finished_at')) this.db.exec('ALTER TABLE social_deliveries ADD COLUMN finished_at INTEGER');
    this.db.exec('CREATE TABLE IF NOT EXISTS notice_authors (id TEXT PRIMARY KEY REFERENCES notices(id), uid TEXT NOT NULL)');
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(column => column.name === 'capture_kind')) this.db.exec('ALTER TABLE posts ADD COLUMN capture_kind TEXT');
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(column => column.name === 'detected_at')) this.db.exec('ALTER TABLE posts ADD COLUMN detected_at INTEGER');
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(column => column.name === 'update_observed_at')) {
      this.db.exec("ALTER TABLE posts ADD COLUMN update_observed_at INTEGER; UPDATE posts SET update_observed_at=first_seen_at");
    }
    if (!this.db.prepare('PRAGMA table_info(notices)').all().some(column => column.name === 'post_id')) this.db.exec('ALTER TABLE notices ADD COLUMN post_id TEXT');
    if (this.db.prepare('PRAGMA table_info(notices)').all().some(column => column.name === 'uid')) {
      this.db.exec('INSERT OR IGNORE INTO notice_authors SELECT id,uid FROM notices WHERE uid IS NOT NULL');
      this.db.exec('ALTER TABLE notices DROP COLUMN uid');
    }
    const columns = this.db.prepare('PRAGMA table_info(targets)').all().map(row => row.name);
    if (!columns.includes('platform')) this.db.exec("ALTER TABLE targets ADD COLUMN platform TEXT NOT NULL DEFAULT 'weibo'");
    if (!columns.includes('external_uid')) this.db.exec('ALTER TABLE targets ADD COLUMN external_uid TEXT');
    this.db.exec('UPDATE targets SET external_uid=uid WHERE external_uid IS NULL');
    if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(column => column.name === 'last_success_at')) this.db.exec('ALTER TABLE jobs ADD COLUMN last_success_at INTEGER');
    for (const field of ['history_from', 'history_to', 'record_from', 'profile_total', 'profile_checked_at']) if (!columns.includes(field)) this.db.exec(`ALTER TABLE targets ADD COLUMN ${field} INTEGER`);
    if (!columns.includes('capture_mode')) this.db.exec("ALTER TABLE targets ADD COLUMN capture_mode TEXT NOT NULL DEFAULT 'active'");
    if (!columns.includes('avatar_url')) {
      this.db.exec('ALTER TABLE targets ADD COLUMN avatar_url TEXT');
      for (const target of this.targets().filter(item => item.platform === 'weibo')) {
        const post = this.db.prepare('SELECT raw FROM posts WHERE uid=? ORDER BY published_at DESC LIMIT 1').get(target.uid);
        if (post) {
          try { this.db.prepare('UPDATE targets SET avatar_url=? WHERE uid=?').run(weiboAvatar(JSON.parse(post.raw).user), target.uid); }
          catch { /* Older archives without usable raw author data keep the initial fallback. */ }
        }
      }
    }
    const targets = this.targets();
    for (const target of targets) {
      if (targets.filter(item => item.name === target.name).length === 1) this.db.prepare("INSERT OR IGNORE INTO notice_authors SELECT id,? FROM notices WHERE kind='update' AND instr(message,?)=1").run(target.uid, target.name + ' 更新了：');
    }
    if (!this.getSetting('noticePostLinks:1', false)) this.transaction(() => {
      const candidates = this.db.prepare('SELECT id,author,text FROM posts WHERE uid=? AND first_seen_at BETWEEN ? AND ?');
      for (const notice of this.db.prepare("SELECT n.id,n.message,n.created_at,a.uid FROM notices n JOIN notice_authors a USING(id) WHERE n.kind='update' AND n.post_id IS NULL ORDER BY n.created_at DESC LIMIT 100").all()) {
        const matches = candidates.all(notice.uid, notice.created_at - 1000, notice.created_at).filter(post => notice.message === post.author + ' 更新了：' + post.text.slice(0, 100));
        if (matches.length === 1) this.db.prepare('UPDATE notices SET post_id=? WHERE id=?').run(matches[0].id, notice.id);
      }
      this.setSetting('noticePostLinks:1', true);
    })();
    if (!this.getSetting('workdayDefaults:1', false)) this.transaction(() => {
      for (const row of this.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'schedule:%' OR key LIKE 'targetPolicy:%'").all()) {
        const value = JSON.parse(row.value), schedule = row.key.startsWith('targetPolicy:') ? value?.schedule : value;
        if (schedule?.windows?.some(window => !window.repeat)) {
          schedule.windows = schedule.windows.map(window => window.repeat ? window : { ...window, repeat: 'weekdays' });
          this.setSetting(row.key, value);
        }
      }
      this.setSetting('workdayDefaults:1', true);
    })();
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  account(platform = 'weibo') {
    return platform === 'weibo' ? this.db.prepare('SELECT * FROM account WHERE id=1').get()
      : this.db.prepare('SELECT * FROM platform_accounts WHERE platform=?').get(platform);
  }

  setAccount(patch, platform = 'weibo', notify = false) {
    const allowed = ['status', 'reason', 'uid', 'next_request_at', 'cooldown_until', 'errors'];
    const entries = Object.entries(patch);
    if (entries.some(([key]) => !allowed.includes(key))) throw new Error('无效账号字段');
    if (entries.length) {
      const table = platform === 'weibo' ? 'account' : 'platform_accounts';
      this.db.prepare(`UPDATE ${table} SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE ${platform === 'weibo' ? 'id=1' : 'platform=?'}`)
        .run(...entries.map(([, value]) => value), ...(platform === 'weibo' ? [] : [platform]));
    }
    if (['weibo', 'xueqiu'].includes(platform) && patch.status === 'ready') {
      if (this.getSetting('accountAlerted:' + platform, false)) this.setSetting('accountAlerted:' + platform, false);
      for (const row of this.db.prepare("SELECT key FROM settings WHERE key LIKE ?").all('accountAlerted:' + platform + ':%')) this.setSetting(row.key, false);
      this.db.prepare("UPDATE social_deliveries SET status='cancelled',error='平台连接已恢复' WHERE uid=? AND status='queued' AND message<>''").run('platform:' + platform);
    }
    if (notify && ['weibo', 'xueqiu'].includes(platform) && ['needs_login', 'needs_verification'].includes(patch.status)) {
      const platformName = platform === 'weibo' ? '微博' : '雪球';
      const delivery = this.getSetting('agentDelivery', null);
      for (const destination of activeDestinations(delivery)) {
        const alertKey = 'accountAlerted:' + platform + ':' + destination.botId + ':' + destination.targetId;
        if (this.getSetting(alertKey, false) || !Array.isArray(delivery.destinations) && this.getSetting('accountAlerted:' + platform, false)) continue;
        const id = randomUUID();
        const message = 'Social Trace · ' + platformName + '连接需要处理\n' + (patch.status === 'needs_login' ? platformName + '登录授权已失效，采集已停止。' : platformName + '要求验证，采集已停止。') + '\n请打开插件「连接与设置 → ' + platformName + '」，主动登录或完成验证后确认连接。\n原因：' + String(patch.reason || '需要重新确认授权').slice(0, 300);
        this.db.prepare('INSERT INTO social_deliveries(id,post_id,uid,author,bot_id,target_id,created_at,message) VALUES(?,?,?,?,?,?,?,?)').run(id, 'account:' + id, 'platform:' + platform, platformName + '连接提醒', destination.botId, destination.targetId, Date.now(), message);
        this.setSetting(alertKey, true);
        this.setSetting('accountAlerted:' + platform, true);
      }
    }
  }

  authorKey(uid, platform = 'weibo') { return platform === 'weibo' ? uid : `${platform}:${uid}`; }

  addTarget(externalUid, name = externalUid, now = Date.now(), platform = 'weibo', { archiveHistory = true, historyFrom = null, historyTo = null, captureMode = 'active' } = {}) {
    const uid = this.authorKey(externalUid, platform);
    const insert = this.transaction(() => {
      const defaults = this.getSetting(platform === 'weibo' ? 'targetDefaults' : `targetDefaults:${platform}`, { intervalMs: 15 * 60000, historyGapMs: 60000 });
      this.db.prepare('INSERT INTO targets(uid,name,created_at,interval_ms,history_gap_ms,platform,external_uid) VALUES(?,?,?,?,?,?,?)')
        .run(uid, name, now, defaults.intervalMs, defaults.historyGapMs, platform, externalUid);
      this.db.prepare('UPDATE targets SET history_from=?,history_to=?,capture_mode=? WHERE uid=?').run(historyFrom, historyTo, captureMode, uid);
      for (const kind of ['history', 'updates']) {
        this.db.prepare('INSERT INTO jobs(id,uid,kind,status,message,updated_at) VALUES(?,?,?,?,?,?)')
          .run(randomUUID(), uid, kind, captureMode === 'pending' || kind === 'history' && !archiveHistory ? 'paused' : 'queued', kind === 'history' && !archiveHistory ? '尚未开启历史缓存，可随时开始' : '', now);
      }
      this.notice('task', `已添加 ${name}：${captureMode === 'pending' ? '请确认记录方式' : archiveHistory ? '监控最新动态，同时分批缓存历史' : '监控最新动态，历史缓存尚未开启'}`, now);
    });
    insert();
  }

  targets() { return this.db.prepare('SELECT * FROM targets ORDER BY created_at DESC').all(); }
  target(uid) { return this.db.prepare('SELECT * FROM targets WHERE uid=?').get(uid); }
  jobs() { return this.db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC').all().map(this.decodeJob); }
  decodeJob(job) { return job ? { ...job, checkpoint: JSON.parse(job.checkpoint) } : null; }
  job(id) { return this.decodeJob(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id)); }
  monitoringEnabled(platform, uid) {
    return this.getSetting('monitorEnabled', true) && this.getSetting('platformEnabled:' + platform, true)
      && (!uid || this.getSetting('targetEnabled:' + uid, true));
  }

  dueJob(now, platform = 'weibo') {
    return this.decodeJob(this.db.prepare(`SELECT jobs.* FROM jobs JOIN targets ON targets.uid=jobs.uid
      WHERE jobs.status='queued' AND next_run_at<=? AND targets.platform=? AND targets.capture_mode<>'pending'
      AND NOT EXISTS (SELECT 1 FROM settings WHERE key='targetEnabled:' || targets.uid AND value='false')
      ORDER BY CASE kind WHEN 'updates' THEN 0 ELSE 1 END,next_run_at LIMIT 1`).get(now, platform));
  }

  nextJobAt(platform, kind = '') {
    return this.db.prepare(`SELECT MIN(next_run_at) AS due FROM jobs JOIN targets ON targets.uid=jobs.uid
      WHERE jobs.status='queued' AND targets.platform=? AND targets.capture_mode<>'pending' AND (?='' OR jobs.kind=?)
      AND NOT EXISTS (SELECT 1 FROM settings WHERE key='targetEnabled:' || targets.uid AND value='false')`).get(platform, kind, kind).due;
  }

  updateJob(id, patch, now = Date.now()) {
    const allowed = ['status', 'checkpoint', 'pages', 'saved', 'next_run_at', 'message', 'last_success_at'];
    const entries = Object.entries(patch);
    if (entries.some(([key]) => !allowed.includes(key))) throw new Error('无效任务字段');
    const values = entries.map(([key, value]) => key === 'checkpoint' ? JSON.stringify(value) : value);
    this.db.prepare(`UPDATE jobs SET ${entries.map(([key]) => `${key}=?`).join(',')},updated_at=? WHERE id=?`)
      .run(...values, now, id);
  }

  notice(kind, message, now = Date.now(), uid = null, postId = null) {
    this.unreadNoticeCache = null;
    const id = randomUUID();
    this.db.prepare('INSERT INTO notices(id,kind,message,created_at,read_at,post_id) VALUES(?,?,?,?,NULL,?)').run(id, kind, message, now, postId);
    if (uid) this.db.prepare('INSERT INTO notice_authors VALUES(?,?)').run(id, uid);
  }
  notices() { return this.db.prepare('SELECT notices.*,notice_authors.uid,posts.published_at,posts.detected_at,posts.first_seen_at AS saved_at FROM notices LEFT JOIN notice_authors USING(id) LEFT JOIN posts ON posts.id=notices.post_id ORDER BY notices.created_at DESC LIMIT 100').all(); }
  unreadNotices() {
    if (this.unreadNoticeCache) return this.unreadNoticeCache;
    const counts = { all: 0, update: 0, attention: 0, task: 0 };
    for (const row of this.db.prepare('SELECT kind,COUNT(*) AS n FROM notices WHERE read_at IS NULL GROUP BY kind').all()) { counts[row.kind] = row.n; counts.all += row.n; }
    return this.unreadNoticeCache = counts;
  }
  acknowledge({ id, uid, kind } = {}) {
    this.unreadNoticeCache = null;
    const where = ['read_at IS NULL'], values = [Date.now()];
    if (id) { where.push('id=?'); values.push(id); }
    if (uid) { where.push('id IN (SELECT id FROM notice_authors WHERE uid=?)'); values.push(uid); }
    if (kind) { where.push('kind=?'); values.push(kind); }
    this.db.prepare('UPDATE notices SET read_at=? WHERE ' + where.join(' AND ')).run(...values);
  }
  unreadContent() {
    const authors = this.db.prepare("SELECT notice_authors.uid,COUNT(*) AS count FROM notices LEFT JOIN notice_authors USING(id) WHERE kind='update' AND read_at IS NULL GROUP BY notice_authors.uid").all();
    return { total: authors.reduce((n, row) => n + row.count, 0), authors };
  }
  hasPost(id) { return !!this.db.prepare('SELECT id FROM posts WHERE id=?').get(id); }
  hasCompletePost(id) { return this.db.prepare('SELECT complete FROM posts WHERE id=?').get(id)?.complete === 1; }

  savePost(post, now = Date.now(), captureKind = null, detectedAt = null) {
    this.summaryCache = null;
    this.todayCountCache = null;
    const previous = this.db.prepare('SELECT complete FROM posts WHERE id=?').get(post.id);
    if (previous?.complete && !post.complete) return false;
    const quote = post.quote ? JSON.stringify(post.quote) : null;
    this.db.prepare(`INSERT INTO posts(id,uid,author,published_at,text,url,quote,complete,raw,first_seen_at,last_seen_at,capture_kind,detected_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET text=excluded.text,quote=excluded.quote,complete=excluded.complete,
      raw=excluded.raw,last_seen_at=excluded.last_seen_at`)
      .run(post.id, post.uid, post.author, post.publishedAt, post.text, post.url, quote,
        Number(post.complete), JSON.stringify(post.raw), now, now, captureKind, detectedAt);
    if (['updates', 'catchup'].includes(captureKind)) this.observeUpdate(post.id, now);
    return !previous;
  }

  observeUpdate(id, now) {
    const post = this.db.prepare('SELECT id,uid,author,published_at,first_seen_at,complete,update_observed_at FROM posts WHERE id=?').get(id);
    if (!post?.complete || post.update_observed_at != null) return;
    this.db.exec('SAVEPOINT observe_update');
    try {
      this.db.prepare('UPDATE posts SET update_observed_at=? WHERE id=?').run(now, id);
      const delivery = this.getSetting('agentDelivery', null), target = this.target(post.uid);
      if (!delivery?.enabled || delivery.uids.length && !delivery.uids.includes(post.uid) || post.published_at < (target.record_from ?? target.created_at)) { this.db.exec('RELEASE observe_update'); return; }
      for (const destination of activeDestinations(delivery)) {
        const from = this.getSetting('deliveryFrom:' + destination.botId + ':' + destination.targetId, 0);
        if (post.first_seen_at < from) continue;
        this.db.prepare('INSERT OR IGNORE INTO social_deliveries(id,post_id,uid,author,bot_id,target_id,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(randomUUID(), post.id, post.uid, post.author, destination.botId, destination.targetId, now);
      }
      this.db.exec('RELEASE observe_update');
    } catch (error) {
      this.db.exec('ROLLBACK TO observe_update; RELEASE observe_update');
      throw error;
    }
  }

  posts({ uid = '', query = '', kind = 'all', offset = 0, limit = 50, modifiedAfter = null, ids = null } = {}) {
    const where = [], args = [];
    if (modifiedAfter) { where.push('(last_seen_at,id)>(?,?)'); args.push(modifiedAfter.at, modifiedAfter.id); }
    if (uid) { where.push('uid=?'); args.push(uid); }
    if (ids) { if (!ids.length) return []; where.push('id IN (' + ids.map(() => '?').join(',') + ')'); args.push(...ids); }
    if (kind === 'original') where.push('quote IS NULL');
    if (kind === 'repost') where.push('quote IS NOT NULL');
    if (query) {
      where.push("(text LIKE ? ESCAPE '\\' OR quote LIKE ? ESCAPE '\\')");
      const escaped = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
      args.push(escaped, escaped);
    }
    return this.db.prepare(`SELECT id,uid,author,published_at,text,url,quote,complete,first_seen_at,last_seen_at,capture_kind,detected_at,raw FROM posts
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${modifiedAfter ? 'last_seen_at,id' : 'published_at DESC,id DESC'} LIMIT ? OFFSET ?`)
      .all(...args, limit, offset).map(({ raw, ...row }) => {
        const source = JSON.parse(raw), quote = row.quote ? JSON.parse(row.quote) : null;
        const platform = row.uid.startsWith('xueqiu:') ? 'xueqiu' : 'weibo';
        return { ...row, article: platform === 'xueqiu' && String(source.type) === '3' && !!source.title, images: platformImages(source, platform), quote: quote ? { ...quote, images: platformImages(source.retweeted_status, platform) } : null };
      });
  }
  postImages(id, quoted = false) {
    const post = this.db.prepare('SELECT uid,raw FROM posts WHERE id=?').get(id);
    if (!post) return null;
    const raw = JSON.parse(post.raw);
    return { uid: post.uid, images: platformImages(quoted ? raw.retweeted_status : raw, this.target(post.uid)?.platform) };
  }
  count() { return this.archiveSummary().reduce((sum, row) => sum + row.count, 0); }
  todayNewCount(now = Date.now()) {
    const day = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
    if (this.todayCountCache?.day === day) return this.todayCountCache.count;
    const count = this.db.prepare(`SELECT COUNT(*) AS n FROM posts p JOIN targets t ON t.uid=p.uid
      WHERE p.first_seen_at>=? AND p.first_seen_at<? AND p.published_at>=MAX(?,COALESCE(t.record_from,t.created_at)) AND p.published_at<?`)
      .get(day, day + 86400000, day, day + 86400000).n;
    this.todayCountCache = { day, count };
    return count;
  }
  archiveSummary() {
    return this.summaryCache ||= this.db.prepare('SELECT uid,COUNT(*) AS count,SUM(quote IS NULL) AS original_count,SUM(quote IS NOT NULL) AS repost_count,MAX(last_seen_at) AS last_saved_at FROM posts GROUP BY uid').all();
  }
  monitoringPolicy(target) {
    return this.getSetting('targetPolicy:' + target.uid, null) || { intervalMs: target.interval_ms, schedule: this.getSetting('schedule:' + target.platform, null) };
  }

  targetProgress(now = Date.now()) {
    const jobs = this.jobs(), summaries = this.archiveSummary();
    return this.targets().map(target => {
      const history = jobs.find(job => job.uid === target.uid && job.kind === 'history');
      const updates = jobs.find(job => job.uid === target.uid && job.kind === 'updates');
      const summary = summaries.find(row => row.uid === target.uid);
      const originalOnly = this.getSetting('historyOriginalOnly:' + target.uid, false);
      const rawTotal = updates?.checkpoint.reportedTotal ?? history?.checkpoint.reportedTotal ?? target.profile_total;
      const total = (typeof rawTotal === 'number' || typeof rawTotal === 'string' && /^\d+$/.test(rawTotal)) && Number.isSafeInteger(Number(rawTotal)) && Number(rawTotal) >= 0 ? Number(rawTotal) : null;
      const saved = summary?.count || 0, account = this.account(target.platform), policy = this.monitoringPolicy(target);
      const policyChange = nextBoundary(policy.schedule, now);
      const canCheck = updates?.status === 'queued' && this.monitoringEnabled(target.platform, target.uid) && account?.status === 'ready';
      return { uid: target.uid, catchup: updates?.checkpoint.catchupFrom != null ? { from: updates.checkpoint.catchupFrom, page: updates.checkpoint.page || 1, saved: Math.max(0, updates.saved - (updates.checkpoint.catchupSaved || 0)) } : null, intervalMs: intervalAt(policy.schedule, policy.intervalMs, now), nextChangeAt: Number.isFinite(policyChange) ? policyChange : null, nextIntervalMs: Number.isFinite(policyChange) ? intervalAt(policy.schedule, policy.intervalMs, policyChange) : null, saved, originals: summary?.original_count || 0, reposts: summary?.repost_count || 0, lastSavedAt: summary?.last_saved_at || null,
        lastCheckedAt: updates?.last_success_at || null,
        nextCheckAt: canCheck ? Math.max(now, updates.next_run_at, account.next_request_at, account.cooldown_until) : null,
        history: { from: target.history_from, to: target.history_to, originalOnly, rangeBounded: target.history_from !== null || target.history_to !== null, rangeComplete: !!history?.checkpoint.rangeComplete,
          rangeSaved: target.history_from === null && target.history_to === null && !originalOnly ? saved : this.db.prepare('SELECT COUNT(*) AS n FROM posts WHERE uid=? AND published_at>=? AND published_at<=? AND (?=0 OR quote IS NULL)').get(target.uid, target.history_from ?? 0, target.history_to ?? Number.MAX_SAFE_INTEGER, Number(originalOnly)).n, id: history?.id, status: history?.status || 'not_started',
          started: this.getSetting('historyRequested:' + target.uid, false) || !!(history?.pages || history?.checkpoint.pageLoaded || history?.checkpoint.pending?.length),
          pages: history?.pages || 0, oldestAt: history?.checkpoint.oldestAt || null, reportedTotal: total,
          estimatedRemaining: originalOnly || target.history_from !== null || target.history_to !== null || total === null || total < saved || history?.status === 'complete' ? null : Math.max(0, total - saved),
          message: history?.message || '' } };
    });
  }

  getSetting(key, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  setSetting(key, value) {
    this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  close() { this.db.close(); }
}
