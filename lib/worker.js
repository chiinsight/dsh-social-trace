import { randomUUID } from 'node:crypto';
import { alignedCheckAt, intervalAt, nextBoundary } from './schedule.js';
import { CaptureError } from './capture-error.js';

export class Worker {
  constructor(store, adapter, { now = Date.now, requestGapMs = 15000, documents = null } = {}) {
    this.store = store;
    this.adapter = adapter;
    this.documents = documents;
    this.suspended = false;
    this.platform = adapter.id || 'weibo';
    this.leaseKey = this.platform === 'weibo' ? 'worker' : 'worker:' + this.platform;
    this.now = now;
    this.requestGapMs = requestGapMs;
    this.busy = null;
    this.currentJobId = null;
    this.stopping = false;
    this.timer = null;
    this.instance = randomUUID();
    this.running = false;
    this.claimAfter = 0;
    this.boundaryAt = 0;
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

  schedule() { return this.store.getSetting('schedule:' + this.platform, null); }

  rescheduleUpdates() {
    const schedule = this.schedule(), now = this.now();
    for (const job of this.store.jobs().filter(job => job.kind === 'updates' && this.store.target(job.uid).platform === this.platform && job.status === 'queued')) {
      if (job.checkpoint.pageLoaded || job.checkpoint.pending?.length || job.checkpoint.page > 1 || job.checkpoint.catchupFrom != null) continue;
      const last = job.checkpoint.lastScanAt || job.last_success_at;
      const target = this.store.target(job.uid), policy = this.store.monitoringPolicy(target);
      const due = Math.max(alignedCheckAt(last || target.record_from || target.created_at, intervalAt(policy.schedule, policy.intervalMs, now), !last), job.checkpoint.retryAt || 0);
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
    if (job?.kind === 'history' && !this.localStep(job)) {
      const updateAt = this.store.nextJobAt(this.platform, 'updates');
      if (updateAt > this.now() && updateAt <= this.now() + this.requestGapMs) return { wait: updateAt };
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
    this.prepareRestartChecks();
    this.running = true;
    this.rescheduleUpdates();
    this.wake();
  }

  async beforeRequest({ profileOnly = false, interactiveProfile = false, verifying = false } = {}) {
    const account = this.store.account(this.platform);
    const job = this.currentJobId ? this.store.job(this.currentJobId) : null;
    if (this.stopping || (verifying ? false : profileOnly ? !['ready', 'paused'].includes(account.status) : !this.store.monitoringEnabled(this.platform, job?.uid) || (job && job.status !== 'queued') || account.status !== 'ready')) throw new CaptureError('stopped', '账号已暂停');
    const interactive = profileOnly && interactiveProfile;
    const profileKey = 'profileRequestAt:' + this.platform;
    const remaining = Math.max(interactive ? this.store.getSetting(profileKey, 0) : account.next_request_at, account.cooldown_until) - this.now();
    if (remaining > 0) throw new CaptureError('wait', '等待下一次请求时间', remaining);
    if (interactive) this.store.setSetting(profileKey, this.now() + this.requestGapMs);
    this.store.setAccount({ next_request_at: Math.max(account.next_request_at, this.now() + this.requestGapMs) }, this.platform);
  }

  async tick() {
    if (this.stopping || this.suspended || this.busy) return;
    const account = this.store.account(this.platform);
    if (!this.store.monitoringEnabled(this.platform) || account.status !== 'ready' || account.cooldown_until > this.now()) return;
    try { if (this.now() >= this.claimAfter) this.claim(); } catch (error) {
      this.stopping = true;
      this.running = false;
      clearTimeout(this.timer);
      throw error;
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
        this.store.updateJob(job.id, { checkpoint }, this.now());
        return;
      }
      if (cached && this.store.hasCompletePost(cached.id)) {
        checkpoint.pending.shift();
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
    const result = await this.adapter.timeline(target.external_uid || job.uid, page, checkpoint.cursor);
    this.requestSucceeded();
    if (!this.canRun(job)) return;
    const detectedAt = this.now();
    const ids = [];
    const pending = [];
    const unpinnedDates = [];
    let foundKnown = false;
    const firstPageIds = page === 1 ? [] : checkpoint.firstPageIds || [];
    for (const raw of result.items) {
      const post = this.normalizePost(raw, target);
      if (!post) continue;
      this.store.db.prepare('UPDATE targets SET name=?,avatar_url=COALESCE(?,avatar_url) WHERE uid=?').run(post.author, post.avatar || null, job.uid);
      ids.push(post.id);
      if (!this.adapter.isPinned(raw)) unpinnedDates.push(post.publishedAt);
      const known = this.store.hasPost(post.id);
      if (!this.adapter.isPinned(raw)) {
        if (page === 1) firstPageIds.push(post.id);
        if (job.kind === 'history' && known) foundKnown = true;
      }
      if (inRange(post)) {
        if (!this.store.hasCompletePost(post.id)) pending.push(raw);
        else if (job.kind === 'updates') this.store.observeUpdate(post.id, this.now());
      }
    }
    // A known ID may come from history; only an older non-pinned page closes the time gap.
    if (job.kind === 'updates') foundKnown = unpinnedDates.length > 0 && unpinnedDates.every(at => at < scanFrom);
    if (ids.length && JSON.stringify(ids) === JSON.stringify(checkpoint.lastPageIds)) {
      throw new CaptureError('schema', '平台重复返回上一页，已暂停，避免循环请求');
    }
    if (!ids.length && !result.end) {
      throw new CaptureError('schema', '平台返回空页且没有明确末尾说明，已暂停待检查');
    }
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
        next_run_at: recheckHead ? this.now() : updateDone ? Math.max(this.now(), alignedCheckAt(checkpoint.lastScanAt || this.now(), intervalAt(policy.schedule, policy.intervalMs, this.now()))) : job.kind === 'history' ? this.now() + target.history_gap_ms : Math.max(this.now(), this.store.account(this.platform).next_request_at),
        message: exhausted ? (checkpoint.rangeComplete ? '已完成所选日期范围内可访问的内容' : checkpoint.endMessage || '已到平台允许访问的末尾，无法证明完整历史')
          : recheckHead ? '离线补查：继续比对重启后变化的最新页' : catchupDone ? '离线补查完成；已保存平台当前可见的动态，恢复定时检查' : updateDone ? '本轮更新检查完成，等待下次检查' : `已完成第 ${checkpoint.page} 页，等待下一批`,
      }, this.now());
      if (catchupDone && current.saved > (checkpoint.catchupSaved || 0)) this.store.notice('task', `${target.name}：离线补查已补存 ${current.saved - (checkpoint.catchupSaved || 0)} 条当前可见动态；已恢复定时检查`, this.now(), target.uid);
      if (exhausted || (job.kind === 'history' && pages % 10 === 0)) {
        this.store.notice('task', `${target.name}：已处理 ${pages} 页、留存 ${current.saved} 条。${exhausted ? (checkpoint.endMessage || '已到可访问末尾') : '历史缓存继续缓慢进行'}`, this.now());
      }
    })();
    this.documents?.drainImages();
  }

  requestSucceeded() {
    const account = this.store.account(this.platform);
    if (account.status === 'ready' && (account.errors || account.reason)) this.store.setAccount({ errors: 0, reason: '' }, this.platform);
  }

  failAccount(error) {
    const account = this.store.account(this.platform);
    let message = error.message;
    if (error.kind === 'limited' || error.kind === 'network') {
      const errors = account.errors + 1;
      const delay = Math.max(error.retryAfter || 0, Math.min(3600000, 60000 * 2 ** Math.min(errors, 6)));
      if (errors >= 3) message += '；连续三次异常，账号任务已暂停';
      this.store.setAccount({ errors, cooldown_until: Math.max(account.cooldown_until, this.now() + delay), reason: message,
        status: errors >= 3 ? 'paused' : account.status }, this.platform);
    } else if (error.kind === 'login' || error.kind === 'verification') {
      this.store.setAccount({ status: error.kind === 'login' ? 'needs_login' : 'needs_verification', reason: message }, this.platform, true);
    }
    return message;
  }

  fail(job, error) {
    const kind = error.kind || 'internal';
    if (kind === 'stopped') return;
    if (kind === 'wait') {
      this.store.updateJob(job.id, { next_run_at: this.now() + error.retryAfter, checkpoint: { ...this.store.job(job.id).checkpoint, retryAt: this.now() + error.retryAfter } }, this.now());
      return;
    }
    let message = error.kind && typeof error.message === 'string' ? error.message : '处理采集数据时发生内部错误，已暂停此任务并保留断点';
    this.store.setSetting('lastFailure:' + this.platform, { uid: job.uid, kind, at: this.now(), message, code: error.kind ? null : String(error.name || 'Error') });
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
