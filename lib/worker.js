import { platformModule } from './platforms/registry.js';
import { randomUUID } from 'node:crypto';
import { alignedCheckAt, intervalAt, nextBoundary } from './schedule.js';
import { CaptureError } from './capture-error.js';

export class Worker {
  constructor(store, adapter, { now = Date.now, requestGapMs = 15000, monitoringGapMs = requestGapMs, documents = null } = {}) {
    this.store = store;
    this.adapter = adapter;
    this.documents = documents;
    this.suspended = false;
    this.platform = adapter.id || 'weibo';
    this.leaseKey = this.platform === 'weibo' ? 'worker' : 'worker:' + this.platform;
    this.now = now;
    this.requestGapMs = requestGapMs;
    this.monitoringGapMs = monitoringGapMs;
    this.busy = null;
    this.currentJobId = null;
    this.stopping = false;
    this.timer = null;
    this.instance = randomUUID();
    this.running = false;
    this.claimAfter = 0;
    this.boundaryAt = 0;
    this.lastTickAt = null;
    this.resumeCheckPending = false;
  }

  claim() {
    this.store.transaction(() => {
      const lease = this.store.getSetting(this.leaseKey, null);
      let alive = true;
      if (lease?.pid && lease.pid !== process.pid) {
        try { process.kill(lease.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
      }
      if (lease && alive && lease.until > this.now() && lease.id !== this.instance) {
        throw new Error('另一个 Social Trace 实例正在使用此档案库，请先关闭它');
      }
      this.claimAfter = this.now() + 30000;
      this.store.setSetting(this.leaseKey, { id: this.instance, pid: process.pid, until: this.now() + 120000 });
    })();
  }

  nextCheck(target, after, inclusive = false) {
    const module = platformModule(this.platform);
    if (module.nextCheckAt) return module.nextCheckAt(this.store, target, after, inclusive);
    const policy = this.store.monitoringPolicy(target);
    return alignedCheckAt(after, intervalAt(policy.schedule, policy.intervalMs, this.now()), inclusive);
  }

  schedule() { return this.store.getSetting('schedule:' + this.platform, null); }

  rescheduleUpdates() {
    const schedule = this.schedule(), now = this.now();
    for (const job of this.store.jobs().filter(job => job.kind === 'updates' && this.store.target(job.uid).platform === this.platform && job.status === 'queued')) {
      if (job.checkpoint.pageLoaded || job.checkpoint.pending?.length || job.checkpoint.page > 1 || job.checkpoint.catchupFrom != null) continue;
      const last = job.checkpoint.lastScanAt || job.last_success_at;
      const target = this.store.target(job.uid), policy = this.store.monitoringPolicy(target);
      const due = Math.max(this.nextCheck(target, last || target.record_from || target.created_at, !last), job.checkpoint.retryAt || 0);
      if (due !== job.next_run_at) this.store.updateJob(job.id, { next_run_at: due }, now);
    }
    this.boundaryAt = Math.min(nextBoundary(schedule, now), ...this.store.targets().filter(target => target.platform === this.platform).map(target => nextBoundary(this.store.monitoringPolicy(target).schedule, now)));
  }

  localStep(job) {
    return job?.checkpoint.pageLoaded && (!job.checkpoint.pending?.length || this.adapter.needsRequest?.(job.checkpoint.pending[0]) === false);
  }

  canRun(job) {
    return !this.stopping && this.store.monitoringEnabled(this.platform, job.uid)
      && this.store.job(job.id)?.status === 'queued' && this.store.account(this.platform).status === 'ready';
  }

  pickJob() {
    const job = this.store.dueJob(this.now(), this.platform);
    if (job && (job.kind === 'history' || job.checkpoint.pageLoaded || job.checkpoint.page > 1) && !this.localStep(job)) {
      const updateAt = this.store.nextJobAt(this.platform, 'updates', true);
      if (updateAt > this.now() && updateAt <= this.now() + Math.min(this.requestGapMs, this.monitoringGapMs)) return { wait: updateAt };
    }
    return { job };
  }

  nextDelay() {
    const now = this.now(), account = this.store.account(this.platform);
    if (this.suspended || !this.store.monitoringEnabled(this.platform) || account.status !== 'ready') return 60000;
    if (account.cooldown_until > now) return Math.min(60000, account.cooldown_until - now);
    const { job, wait } = this.pickJob();
    const next = wait ?? this.store.nextJobAt(this.platform);
    const local = this.localStep(job);
    const due = next === null ? now + 60000 : Math.max(next, local ? 0 : account.next_request_at, account.cooldown_until);
    return Math.max(50, Math.min(60000, due - now, this.boundaryAt - now));
  }

  wake(delay = 0) {
    if (!this.running || this.stopping || this.busy) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try { await this.tick(); } catch { /* A lost lease stops this worker. */ }
      finally { if (!this.stopping) this.wake(this.nextDelay()); }
    }, delay);
    this.timer.unref();
  }

  prepareRestartChecks() {
    const now = this.now();
    for (const job of this.store.jobs().filter(job => job.kind === 'updates' && job.status === 'queued')) {
      const target = this.store.target(job.uid), checkpoint = job.checkpoint;
      if (target.platform !== this.platform || target.capture_mode === 'pending' || !this.store.monitoringEnabled(this.platform, job.uid)) continue;
      const latest = this.store.db.prepare('SELECT MAX(published_at) AS at FROM posts WHERE uid=? AND published_at<=?').get(job.uid, now).at;
      const anchors = [checkpoint.catchupFrom, checkpoint.scanFrom, checkpoint.coveredThrough, checkpoint.lastScanAt, job.last_success_at, latest].filter(at => Number.isFinite(at) && at > 0);
      if (!anchors.length) continue; // A new author still starts on the configured clock boundary.
      const from = Math.max(target.record_from ?? target.created_at, Math.min(...anchors));
      this.store.updateJob(job.id, { checkpoint: { ...checkpoint, catchupFrom: from,
        catchupSaved: checkpoint.catchupSaved ?? job.saved,
        restartHead: checkpoint.restartHead || !!(checkpoint.pageLoaded || checkpoint.pending?.length || checkpoint.page > 1) },
        next_run_at: Math.max(now, checkpoint.retryAt || 0), message: '正在比对本地存档，补查离线期间的动态' }, now);
    }
  }

  start() {
    if (this.running && !this.stopping) return;
    this.claim();
    if (this.store.account(this.platform).status === 'ready') this.recoverContentFailures();
    this.prepareRestartChecks();
    this.lastTickAt = this.now();
    this.resumeCheckPending = false;
    this.running = true;
    this.rescheduleUpdates();
    this.wake();
  }

  async beforeRequest({ profileOnly = false, interactiveProfile = false, verifying = false, monitoringHead = false } = {}) {
    const account = this.store.account(this.platform);
    const job = this.currentJobId ? this.store.job(this.currentJobId) : null;
    if (this.stopping || (verifying ? false : profileOnly ? !['ready', 'paused'].includes(account.status) : !this.store.monitoringEnabled(this.platform, job?.uid) || (job && job.status !== 'queued') || account.status !== 'ready')) throw new CaptureError('stopped', '账号已暂停');
    const interactive = profileOnly && interactiveProfile;
    const profileKey = 'profileRequestAt:' + this.platform;
    const auxiliary = !monitoringHead && !interactive && !verifying;
    const auxiliaryKey = 'auxiliaryRequestAt:' + this.platform;
    const remaining = Math.max(interactive ? this.store.getSetting(profileKey, 0) : account.next_request_at,
      auxiliary ? this.store.getSetting(auxiliaryKey, 0) : 0, account.cooldown_until) - this.now();
    if (remaining > 0) throw new CaptureError('wait', '等待下一次请求时间', remaining);
    if (interactive) this.store.setSetting(profileKey, this.now() + this.requestGapMs);
    if (auxiliary) this.store.setSetting(auxiliaryKey, this.now() + this.requestGapMs);
    const gap = Math.min(this.requestGapMs, this.monitoringGapMs);
    this.store.setAccount({ next_request_at: Math.max(account.next_request_at, this.now() + gap) }, this.platform);
  }

  recovery() {
    const key = 'connectionRecovery:' + this.platform;
    let recovery = this.store.getSetting(key, null);
    const account = this.store.account(this.platform);
    if (this.store.getSetting('accountManualPause:' + this.platform, false) || /手动暂停/.test(account.reason || '')) return null;
    // Upgrade previously automatic network pauses without reviving manual pauses.
    if (!recovery && account.uid && account.status === 'paused' && account.errors >= 3 && /连续三次异常/.test(account.reason || '')) {
      recovery = { id: randomUUID(), kind: 'network', attempts: 0, nextAt: Math.max(this.now(), account.cooldown_until) };
      this.store.setSetting(key, recovery);
    }
    if (!recovery && account.uid && platformModule(this.platform).recoverLegacyConnection?.(account)) {
      recovery = { id: randomUUID(), kind: 'network', attempts: 0, nextAt: Math.max(this.now(), account.cooldown_until, account.next_request_at) };
      this.store.setSetting(key, recovery);
      for (const notice of this.store.notices()) {
        if (notice.kind === 'attention' && !notice.read_at && notice.message.includes(account.reason)
          && this.store.target(notice.uid)?.platform === this.platform) this.store.acknowledge({ id: notice.id });
      }
    }
    return recovery;
  }

  confirmConnection(uid) {
    const previous = this.store.account(this.platform);
    if (previous.uid && previous.uid !== uid) throw new CaptureError('login', '当前登录账号与资料库绑定账号不同，请切回原账号');
    this.store.transaction(() => {
      this.store.setAccount({ uid, status: 'ready', reason: '', errors: 0 }, this.platform);
      this.store.setSetting('connectionRecovery:' + this.platform, null);
      this.store.setSetting('accountManualPause:' + this.platform, false);
    })();
  }

  async recoverConnection(recovery) {
    const key = 'connectionRecovery:' + this.platform;
    const current = () => !this.stopping && !this.suspended && this.store.monitoringEnabled(this.platform)
      && this.store.getSetting(key, null)?.id === recovery.id;
    try {
      const uid = await this.adapter.checkLogin(); // Uses the saved HTTP session; never opens a browser.
      if (!current()) return;
      this.confirmConnection(uid);
      this.prepareRestartChecks();
      this.store.notice('task', ({ weibo: '微博', xueqiu: '雪球', douyin: '抖音' }[this.platform] || this.platform) + '连接已自动恢复，继续检查新动态', this.now());
    } catch (error) {
      if (!current()) return;
      const kind = error.kind || 'internal';
      if (['network', 'limited', 'wait'].includes(kind)) {
        const attempts = recovery.attempts + 1;
        const delay = Math.max(error.retryAfter || 0, Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6)));
        const until = Math.max(this.store.account(this.platform).cooldown_until, this.now() + delay);
        this.store.setAccount({ status: 'paused', cooldown_until: until, reason: '连接暂时不可用，将自动检查恢复；无需反复点击检查连接' }, this.platform);
        this.store.setSetting(key, { ...recovery, attempts, nextAt: until });
      } else {
        this.store.setSetting(key, null);
        this.store.setAccount({ status: kind === 'login' ? 'needs_login' : kind === 'verification' ? 'needs_verification' : 'paused', reason: error.message || '自动检查未能确认授权，请检查平台登录' }, this.platform, true);
      }
    }
  }

  async tick() {
    if (this.stopping || this.suspended || this.busy) return;
    if (this.running) {
      if (this.lastTickAt !== null && this.now() - this.lastTickAt > 120000) this.resumeCheckPending = true;
      this.lastTickAt = this.now();
    }
    const account = this.store.account(this.platform);
    if (!this.store.monitoringEnabled(this.platform)) return;
    try { if (this.now() >= this.claimAfter) this.claim(); } catch (error) {
      this.stopping = true;
      this.running = false;
      clearTimeout(this.timer);
      throw error;
    }
    const recovery = this.recovery();
    if (account.status !== 'ready') {
      const activeTasks = this.store.jobs().some(job => job.status === 'queued' && this.store.target(job.uid)?.platform === this.platform && this.store.monitoringEnabled(this.platform, job.uid));
      if (!activeTasks) return;
      if (!recovery || typeof this.adapter.checkLogin !== 'function' || Math.max(recovery.nextAt, account.cooldown_until, account.next_request_at) > this.now()) return;
      this.busy = this.recoverConnection(recovery);
      try { await this.busy; } finally { this.busy = null; }
      return;
    }
    if (account.cooldown_until > this.now()) return;
    this.recoverContentFailures();
    if (this.resumeCheckPending) {
      this.prepareRestartChecks();
      this.resumeCheckPending = false;
    }
    if (this.now() >= this.boundaryAt) this.rescheduleUpdates();
    const { job } = this.pickJob();
    if (!job) return;
    this.currentJobId = job.id;
    this.busy = this.step(job).catch(error => { if (this.canRun(job)) this.fail(job, error); });
    try { await this.busy; } finally { this.busy = null; this.currentJobId = null; }
  }

  normalizePost(raw, target) {
    const post = this.adapter.normalizePost(raw, target.external_uid || target.uid);
    if (!post) return null;
    return { ...post, uid: target.uid, id: this.platform === 'weibo' ? post.id : `${this.platform}:${post.id}` };
  }

  async step(job) {
    const target = this.store.target(job.uid);
    const checkpoint = structuredClone(job.checkpoint);
    const originalOnly = job.kind === 'history' && this.store.getSetting('historyOriginalOnly:' + target.uid, false);
    const recordFrom = target.record_from ?? target.created_at;
    const scanFrom = checkpoint.catchupFrom ?? checkpoint.scanFrom ?? checkpoint.coveredThrough ?? (checkpoint.initialized ? checkpoint.lastScanAt : null) ?? recordFrom;
    const inRange = post => job.kind === 'updates' ? post.publishedAt >= Math.max(recordFrom, checkpoint.catchupFrom ?? recordFrom) : post.publishedAt >= (target.history_from ?? 0) && post.publishedAt <= (target.history_to ?? Infinity) && (!originalOnly || !post.quote);
    if (this.adapter.profile && target.name === (target.external_uid || target.uid) && !checkpoint.profileRead) {
      const profile = await this.adapter.profile(target.external_uid || target.uid);
      this.requestSucceeded();
      if (!this.canRun(job)) return;
      this.store.db.prepare('UPDATE targets SET name=?,avatar_url=COALESCE(?,avatar_url),profile_total=COALESCE(?,profile_total),profile_checked_at=? WHERE uid=?').run(profile.name, profile.avatar, profile.total ?? null, this.now(), target.uid);
      this.store.updateJob(job.id, { checkpoint: { ...checkpoint, profileRead: true }, message: '博主资料已更新，等待读取动态' }, this.now());
      return;
    }
    if (checkpoint.pending?.length) {
      const cached = this.normalizePost(checkpoint.pending[0], target);
      if (cached && !inRange(cached)) {
        checkpoint.pending.shift();
        this.clearContentIssue(checkpoint);
        this.store.updateJob(job.id, { checkpoint }, this.now());
        return;
      }
      if (cached && this.store.hasCompletePost(cached.id)) {
        checkpoint.pending.shift();
        this.clearContentIssue(checkpoint);
        checkpoint.oldestAt = Math.min(checkpoint.oldestAt || cached.publishedAt, cached.publishedAt);
        this.store.updateJob(job.id, { checkpoint, message: '已跳过本地已有全文，减少重复请求' }, this.now());
        return;
      }
      const requested = this.adapter.needsRequest?.(checkpoint.pending[0]) !== false;
      const raw = await this.adapter.complete(checkpoint.pending[0]);
      if (requested) this.requestSucceeded();
      if (!this.canRun(job)) return;
      const post = this.normalizePost(raw, target);
      if (!post) throw new CaptureError('schema', '待保存内容的作者不匹配');
      if (!post.complete) {
        checkpoint.pending[0] = raw;
        this.store.updateJob(job.id, { checkpoint, message: '已保存正文读取断点，等待补齐剩余内容' }, this.now());
        return;
      }
      this.store.transaction(() => {
        const inserted = this.store.savePost(post, this.now(), job.kind === 'updates' && checkpoint.catchupFrom != null ? 'catchup' : job.kind, checkpoint.detectedAt ?? null);
        checkpoint.oldestAt = Math.min(checkpoint.oldestAt || post.publishedAt, post.publishedAt);
        checkpoint.pending.shift();
        this.clearContentIssue(checkpoint);
        const current = this.store.job(job.id);
        this.store.updateJob(job.id, { checkpoint, saved: current.saved + Number(inserted), message: '正在保存本页正文' }, this.now());
        this.store.db.prepare('UPDATE targets SET name=? WHERE uid=?').run(post.author, job.uid);
        if (inserted && post.publishedAt >= (target.record_from ?? target.created_at)) {
          this.store.notice('update', `${post.author}${job.kind === 'updates' && checkpoint.catchupFrom != null ? ' 离线期间的动态（恢复后补查）' : ' 更新了'}：${post.text.slice(0, 100)}`, this.now(), job.uid, post.id);
        }
      })();
      if (this.documents?.save(post)) this.documents.enqueueImages(post, job.kind);
      return;
    }

    if (checkpoint.pageLoaded) {
      this.finishPage(job, checkpoint, target);
      return;
    }
    const page = checkpoint.page || 1;
    const result = await this.adapter.timeline(target.external_uid || job.uid, page, checkpoint.cursor, { monitoringHead: job.kind === 'updates' && page === 1 });
    this.requestSucceeded();
    if (!this.canRun(job)) return;
    const detectedAt = this.now();
    const ids = [];
    const pending = [];
    const unpinnedDates = [];
    let foundKnown = false;
    let reachedBoundary = false;
    const firstPageIds = page === 1 ? [] : checkpoint.firstPageIds || [];
    for (const raw of result.items) {
      const post = this.normalizePost(raw, target);
      if (!post) continue;
      this.store.db.prepare('UPDATE targets SET name=?,avatar_url=COALESCE(?,avatar_url) WHERE uid=?').run(post.author, post.avatar || null, job.uid);
      ids.push(post.id);
      if (!this.adapter.isPinned(raw)) unpinnedDates.push(post.publishedAt);
      const known = this.store.hasPost(post.id);
      if (known && post.video) {
        this.store.saveVideo(post, this.now(), job.kind);
        this.documents?.save(post);
      }
      if (!this.adapter.isPinned(raw)) {
        if (page === 1) firstPageIds.push(post.id);
        if (job.kind === 'history' && known) foundKnown = true;
        if (checkpoint.boundaryIds?.includes(post.id) && post.publishedAt < scanFrom) reachedBoundary = true;
      }
      if (inRange(post)) {
        if (!this.store.hasCompletePost(post.id)) pending.push(raw);
        else if (job.kind === 'updates') this.store.observeUpdate(post.id, this.now());
      }
    }
    // Only the previous update head is a baseline; arbitrary history IDs and pinned posts are not.
    if (job.kind === 'updates') foundKnown = unpinnedDates.length > 0 && (unpinnedDates.every(at => at < scanFrom)
      || checkpoint.catchupFrom == null && reachedBoundary);
    if (ids.length && JSON.stringify(ids) === JSON.stringify(checkpoint.lastPageIds)) {
      throw new CaptureError('schema', '平台重复返回上一页，已暂停，避免循环请求');
    }
    if (!ids.length && !result.end) {
      throw new CaptureError('schema', '平台返回空页且没有明确末尾说明，已暂停待检查');
    }
    if (job.kind === 'updates') this.recordCheck(job.uid, { at: detectedAt, page, stage: 'timeline', status: 'success', count: ids.length,
      newestPublishedAt: unpinnedDates.length ? Math.max(...unpinnedDates) : null });
    this.store.updateJob(job.id, {
      checkpoint: { ...checkpoint, scanFrom, pending, page, pageLoaded: true, lastPageIds: ids, detectedAt,
        firstPageIds, lastScanAt: page === 1 ? this.now() : checkpoint.lastScanAt, retryAt: 0,
        nextCursor: result.nextCursor, reportedTotal: result.total ?? checkpoint.reportedTotal,
        rangeComplete: job.kind === 'history' && target.history_from !== null && unpinnedDates.length > 0 && unpinnedDates.every(date => date < target.history_from),
        end: result.end, endMessage: result.endMessage, foundKnown },
      message: `${checkpoint.catchupFrom != null ? '离线补查：' : ''}第 ${page} 页已读取，等待正文留存`,
    }, this.now());
  }

  finishPage(job, checkpoint, target) {
    const policy = this.store.monitoringPolicy(target);
    const pages = job.pages + 1;
    const end = checkpoint.end || checkpoint.rangeComplete;
    const cycleDone = end || (job.kind === 'updates' && checkpoint.foundKnown);
    const initial = job.kind === 'updates' && !checkpoint.initialized && target.record_from === null && checkpoint.catchupFrom == null;
    // The first update scan establishes a baseline; history handles older pages.
    const updateDone = job.kind === 'updates' && (cycleDone || initial);
    const recheckHead = updateDone && checkpoint.restartHead;
    const catchupDone = updateDone && checkpoint.catchupFrom != null && !recheckHead;
    const savedCheckpoint = recheckHead
      ? { page: 1, initialized: true, coveredThrough: checkpoint.coveredThrough, catchupFrom: checkpoint.catchupFrom, catchupSaved: checkpoint.catchupSaved, retryAt: 0 }
      : updateDone
      ? { page: 1, initialized: true, reportedTotal: checkpoint.reportedTotal, boundaryIds: checkpoint.firstPageIds || checkpoint.boundaryIds || [], lastScanAt: checkpoint.lastScanAt, coveredThrough: checkpoint.lastScanAt, retryAt: 0 }
      : { page: checkpoint.page + 1, cursor: checkpoint.nextCursor, lastPageIds: checkpoint.lastPageIds,
        oldestAt: checkpoint.oldestAt, reportedTotal: checkpoint.reportedTotal,
        scanFrom: checkpoint.scanFrom, coveredThrough: checkpoint.coveredThrough, catchupFrom: checkpoint.catchupFrom, catchupSaved: checkpoint.catchupSaved, restartHead: checkpoint.restartHead,
        initialized: checkpoint.initialized, boundaryIds: checkpoint.boundaryIds, firstPageIds: checkpoint.firstPageIds, lastScanAt: checkpoint.lastScanAt, rangeComplete: !!checkpoint.rangeComplete };
    this.store.transaction(() => {
      const current = this.store.job(job.id);
      const exhausted = job.kind === 'history' && end;
      this.store.updateJob(job.id, {
        checkpoint: savedCheckpoint, pages, last_success_at: job.kind === 'updates' && (!updateDone || recheckHead) ? current.last_success_at : this.now(),
        status: current.status === 'paused' ? 'paused' : exhausted ? 'complete' : 'queued',
        next_run_at: recheckHead ? this.now() : updateDone ? Math.max(this.now(), this.nextCheck(target, checkpoint.lastScanAt || this.now())) : job.kind === 'history' ? this.now() + target.history_gap_ms : Math.max(this.now(), this.store.account(this.platform).next_request_at),
        message: exhausted ? (checkpoint.rangeComplete ? '已完成所选日期范围内可访问的内容' : checkpoint.endMessage || '已到平台允许访问的末尾，无法证明完整历史')
          : recheckHead ? '离线补查：继续比对重启后变化的最新页' : catchupDone ? '离线补查完成；已保存平台当前可见的动态，恢复定时检查' : updateDone ? '本轮更新检查完成，等待下次检查' : `已完成第 ${checkpoint.page} 页，等待下一批`,
      }, this.now());
      if (catchupDone && current.saved > (checkpoint.catchupSaved || 0)) this.store.notice('task', `${target.name}：离线补查已补存 ${current.saved - (checkpoint.catchupSaved || 0)} 条当前可见动态；已恢复定时检查`, this.now(), target.uid);
      if (exhausted || (job.kind === 'history' && pages % 10 === 0)) {
        this.store.notice('task', `${target.name}：已处理 ${pages} 页、留存 ${current.saved} 条。${exhausted ? (checkpoint.endMessage || '已到可访问末尾') : '历史缓存继续缓慢进行'}`, this.now());
      }
    })();
    this.documents?.drainImages();
    if (updateDone || job.kind === 'history' && end) void (this.adapter.finishScan || this.adapter.release)?.call(this.adapter)?.catch(() => {});
  }

  requestSucceeded() {
    const account = this.store.account(this.platform);
    if (account.status === 'ready' && (account.errors || account.reason)) this.store.setAccount({ errors: 0, reason: '' }, this.platform);
  }

  recordCheck(uid, check) {
    const key = 'checkHistory:' + uid;
    this.store.setSetting(key, [...this.store.getSetting(key, []), check].slice(-32));
  }

  failAccount(error) {
    const account = this.store.account(this.platform);
    let message = error.message;
    const manualPause = this.store.getSetting('accountManualPause:' + this.platform, false) || /手动暂停/.test(account.reason || '');
    if (manualPause) return message;
    if (error.kind === 'limited' || error.kind === 'network') {
      const errors = account.errors + 1;
      const delay = Math.max(error.retryAfter || 0, Math.min(3600000, 60000 * 2 ** Math.min(errors, 6)));
      if (errors >= 3) message += account.uid && typeof this.adapter.checkLogin === 'function' ? '；连续三次连接异常，冷却后自动检查恢复' : '；连续三次连接异常，已暂停，请检查平台授权';
      this.store.setAccount({ errors, cooldown_until: Math.max(account.cooldown_until, this.now() + delay), reason: message,
        status: errors >= 3 ? 'paused' : account.status }, this.platform);
      if (errors >= 3 && account.uid && typeof this.adapter.checkLogin === 'function') this.store.setSetting('connectionRecovery:' + this.platform,
        { id: randomUUID(), kind: error.kind, attempts: 0, nextAt: this.store.account(this.platform).cooldown_until });
    } else if (error.kind === 'login' || error.kind === 'verification') {
      const recheck = error.kind === 'login' && account.uid && typeof this.adapter.checkLogin === 'function';
      this.store.setSetting('connectionRecovery:' + this.platform, recheck ? { id: randomUUID(), kind: 'login', attempts: 0, nextAt: Math.max(this.now() + 60000, account.cooldown_until, account.next_request_at) } : null);
      this.store.setAccount({ status: error.kind === 'login' ? 'needs_login' : 'needs_verification', reason: message }, this.platform, !recheck);
    }
    return message;
  }

  clearContentIssue(checkpoint) {
    if (checkpoint.contentIssue?.noticeId) this.store.acknowledge({ id: checkpoint.contentIssue.noticeId });
    delete checkpoint.contentIssue; checkpoint.retryAt = 0;
  }

  recoverContentFailures() {
    const module = platformModule(this.platform);
    if (!module.contentProblem) return;
    for (const job of this.store.jobs()) {
      if (job.status !== 'needs_review' || job.checkpoint.contentIssue || this.store.target(job.uid)?.platform !== this.platform || !this.store.monitoringEnabled(this.platform, job.uid)) continue;
      const error = { kind: 'schema', message: job.message };
      if (module.contentProblem(error, job)) this.fail(job, error);
    }
  }

  retryContent(job, error) {
    const module = platformModule(this.platform), issue = module.contentProblem?.(error, job);
    if (!issue) return false;
    const checkpoint = structuredClone(this.store.job(job.id).checkpoint), previous = checkpoint.contentIssue;
    const attempts = previous?.postId === issue.postId ? previous.attempts || 0 : 0;
    const delays = module.contentRetryDelays || [];
    const exhausted = attempts >= delays.length;
    const nextRetryAt = exhausted ? null : Math.max(this.now() + delays[attempts], this.store.account(this.platform).next_request_at);
    checkpoint.contentIssue = { ...issue, ...(previous?.postId === issue.postId && previous.noticeId ? { noticeId: previous.noticeId } : {}), attempts: exhausted ? attempts : attempts + 1, maxAttempts: delays.length, nextRetryAt, exhausted };
    checkpoint.retryAt = nextRetryAt || 0;
    const message = exhausted ? '已自动重试 ' + attempts + ' 次，仍未获取这条内容的全文；可查看原文，或保留片段并跳过这条继续缓存'
      : '这条内容暂未返回全文，已安排第 ' + (attempts + 1) + '/' + delays.length + ' 次自动重试，无需操作';
    this.store.updateJob(job.id, { status: exhausted ? 'needs_review' : 'queued', checkpoint, next_run_at: nextRetryAt || this.now(), message }, this.now());
    if (!exhausted && job.status === 'needs_review' && !previous) {
      for (const notice of this.store.notices()) if (notice.uid === job.uid && notice.kind === 'attention' && notice.message.includes(job.message)) this.store.acknowledge({ id: notice.id });
    }
    if (exhausted && !previous?.exhausted) {
      const noticeId = this.store.notice('attention', this.store.target(job.uid).name + '：' + message, this.now(), job.uid);
      checkpoint.contentIssue.noticeId = noticeId;
      this.store.updateJob(job.id, { checkpoint }, this.now());
    }
    return true;
  }

  fail(job, error) {
    const kind = error.kind || 'internal';
    if (kind === 'stopped') return;
    if (this.retryContent(job, error)) return;
    if (kind === 'wait') {
      this.store.updateJob(job.id, { next_run_at: this.now() + error.retryAfter, checkpoint: { ...this.store.job(job.id).checkpoint, retryAt: this.now() + error.retryAfter } }, this.now());
      return;
    }
    let message = error.kind && typeof error.message === 'string' ? error.message : '处理采集数据时发生内部错误，已暂停此任务并保留断点';
    this.store.setSetting('lastFailure:' + this.platform, { uid: job.uid, kind, at: this.now(), message, code: error.kind ? null : String(error.name || 'Error') });
    if (job.kind === 'updates') this.recordCheck(job.uid, { at: this.now(), page: job.checkpoint.page || 1,
      stage: job.checkpoint.pending?.length ? 'complete' : 'timeline', status: kind });
    if (kind === 'limited' || kind === 'network') {
      message = this.failAccount(error);
      const retryAt = this.store.account(this.platform).cooldown_until;
      this.store.updateJob(job.id, { message, next_run_at: retryAt, checkpoint: { ...this.store.job(job.id).checkpoint, retryAt } }, this.now());
    } else if (kind === 'login' || kind === 'verification') {
      message = this.failAccount(error);
      this.store.updateJob(job.id, { message }, this.now());
    } else {
      this.store.updateJob(job.id, { status: 'needs_review', message }, this.now());
    }
    if (!platformModule(this.platform).transientConnectionFailure?.(error) || this.store.account(this.platform).errors >= 3)
      this.store.notice('attention', `${this.store.target(job.uid).name}：${message}`, this.now(), job.uid);
  }

  async stop() {
    this.stopping = true;
    this.running = false;
    clearTimeout(this.timer);
    if (this.busy) await this.busy;
    const lease = this.store.getSetting(this.leaseKey, null);
    if (lease?.id === this.instance) this.store.setSetting(this.leaseKey, null);
  }
}
