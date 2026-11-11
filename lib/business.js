import { platformModule } from './platforms/registry.js';
import { validateSchedule } from './schedule.js';
import { parseHistoryRange } from './history-range.js';
import { CaptureError } from './capture-error.js';

export function createBusiness(getStore, sources, drainImages, content = {}) {
  const fail = text => { throw new CaptureError('input', text); };
  const wake = () => { Object.values(sources).forEach(source => { source.worker.rescheduleUpdates(); source.worker.wake(); }); drainImages(); };
  return {
    scopePlan(args) {
      const store = getStore();
      if (!Array.isArray(args.uids) || !args.uids.length || args.uids.length > 200 || new Set(args.uids).size !== args.uids.length) fail('请选择有效且不重复的博主');
      const targets = args.uids.map(uid => store.target(uid));
      if (targets.some(target => !target || target.capture_mode === 'pending')) fail('请先添加博主并确认记录方式');
      const keys = Object.keys(args).filter(key => key !== 'uids');
      const allowed = ['from', 'to', 'originalOnly', 'historyEnabled', 'saveVideo', 'saveAudio', 'platformAI', 'transcribe', 'times', 'repeat'];
      if (!keys.length || keys.some(key => !allowed.includes(key))) fail('请选择要修改的监控范围');
      for (const key of ['originalOnly', 'historyEnabled', 'saveVideo', 'saveAudio', 'platformAI', 'transcribe']) if (args[key] !== undefined && typeof args[key] !== 'boolean') fail('请选择有效的开关值');
      return targets.map(target => {
        const date = value => value === null ? '' : new Date(value + 28800000).toISOString().slice(0, 10);
        const range = parseHistoryRange(args.from ?? date(target.history_from), args.to ?? date(target.history_to));
        const options = Object.fromEntries(keys.filter(key => !['from', 'to', 'originalOnly', 'historyEnabled'].includes(key)).map(key => [key, args[key]]));
        if (Object.keys(options).length) content.validate?.(target, options) ?? fail('此平台不支持这些内容或时间设置');
        return { target, range, options };
      });
    },
    scopeInfo(uid) {
      const store = getStore(), target = store.target(uid);
      if (!target) fail('博主不存在');
      const date = value => value === null ? null : new Date(value + 28800000).toISOString().slice(0, 10);
      return { uid, author: target.name, platform: target.platform, from: date(target.history_from), to: date(target.history_to),
        originalOnly: store.getSetting('historyOriginalOnly:' + uid, false), historyStatus: store.jobs().find(job => job.uid === uid && job.kind === 'history')?.status,
        policy: store.monitoringPolicy(target), ...platformModule(target.platform).publicConfig?.(store, target) };
    },
    async scope(args) {
      const plans = this.scopePlan(args), store = getStore();
      const affected = [...new Set(plans.map(plan => sources[plan.target.platform]))];
      if (affected.some(source => source.loginBusy || source.historyBusy)) fail('正在处理平台账号或缓存设置，请稍后再试');
      affected.forEach(source => { source.historyBusy = true; source.worker.suspended = true; });
      try {
        await Promise.all(affected.map(source => source.worker.busy).filter(Boolean));
        store.transaction(() => {
          for (const { target, range, options } of plans) {
            const job = store.jobs().find(job => job.uid === target.uid && job.kind === 'history');
            const originalOnly = args.originalOnly ?? store.getSetting('historyOriginalOnly:' + target.uid, false);
            const changed = target.history_from !== range.from || target.history_to !== range.to || originalOnly !== store.getSetting('historyOriginalOnly:' + target.uid, false);
            store.db.prepare('UPDATE targets SET history_from=?,history_to=? WHERE uid=?').run(range.from, range.to, target.uid);
            store.setSetting('historyOriginalOnly:' + target.uid, originalOnly);
            if (changed) store.updateJob(job.id, { checkpoint: {}, pages: 0, saved: 0, last_success_at: null, status: args.historyEnabled === false || job.status === 'paused' && args.historyEnabled !== true ? 'paused' : 'queued', next_run_at: 0, message: '缓存范围已更新，已有内容保留' });
            if (args.historyEnabled !== undefined) {
              if (args.historyEnabled) store.setSetting('historyRequested:' + target.uid, true);
              if (args.historyEnabled && !store.getSetting('targetEnabled:' + target.uid, true)) {
                for (const other of store.jobs().filter(other => other.uid === target.uid && other.kind !== 'history' && other.status === 'queued')) store.updateJob(other.id, { status: 'paused', message: '保留原博主关闭状态，等待单独开启' });
                store.setSetting('targetEnabled:' + target.uid, true);
              }
              if (!(job.status === 'complete' && !changed && args.historyEnabled)) store.updateJob(job.id, { status: args.historyEnabled ? 'queued' : 'paused', message: args.historyEnabled ? '等待继续缓存以前的消息' : '已手动暂停，断点保留' });
            }
            if (Object.keys(options).length) content.save(target, options);
          }
        })();
        return { targets: plans.map(({ target }) => this.scopeInfo(target.uid)), note: '已保存并回读配置；已有资料保留。视频/音频/转写开启后，也会为已保存的作品补排尚未请求的处理；实际执行仍受监控开关、账号和本机环境约束。' };
      } finally { affected.forEach(source => { source.historyBusy = false; source.worker.suspended = false; source.worker.wake(); }); }
    },
    policy(body) {
      const store = getStore(), target = store.target(body.uid);
      if (platformModule(target?.platform).intervalScheduling === false) fail(platformModule(target.platform).scheduleHelp);
      if (!target || target.platform !== body.platform || typeof body.inherit !== 'boolean') fail('请选择有效的博主设置');
      const interval = Number(body.intervalMinutes);
      if (!body.inherit && (!Number.isInteger(interval) || interval < 1 || interval > 10080)) fail('检查间隔为 1–10080 分钟');
      const policy = body.inherit ? null : { intervalMs: interval * 60000, schedule: validateSchedule(body.schedule) };
      store.setSetting('targetPolicy:' + target.uid, policy); wake();
      return { uid: target.uid, policy: store.monitoringPolicy(target) };
    },
    skipContent(id, postId) {
      const store = getStore(), job = store.job(id), issue = job?.checkpoint.contentIssue;
      if (!job || job.status !== 'needs_review' || !issue?.exhausted || issue.postId !== postId || !job.checkpoint.pending?.length) fail('这条缓存问题已变化，请刷新后查看');
      const source = sources[store.target(job.uid).platform], post = source.worker.normalizePost(job.checkpoint.pending[0], store.target(job.uid));
      if (!post || post.id.split(':').at(-1) !== issue.rootId) fail('当前待处理内容已变化，请刷新后查看');
      const checkpoint = structuredClone(job.checkpoint); checkpoint.pending.shift();
      delete checkpoint.contentIssue; checkpoint.retryAt = 0;
      checkpoint.skippedContent = (checkpoint.skippedContent || 0) + 1;
      store.transaction(() => {
        const inserted = store.savePost({ ...post, complete: false }, Date.now(), job.kind, checkpoint.detectedAt || null);
        if (issue.noticeId) store.acknowledge({ id: issue.noticeId });
        store.updateJob(job.id, { checkpoint, status: 'queued', saved: job.saved + Number(inserted), next_run_at: Date.now(), message: '已保留这条内容的片段和原文链接，继续缓存其他内容' });
      })();
      source.worker.documents?.save({ ...post, complete: false }); wake();
      return { ok: true, message: '已保留片段和来源链接，继续缓存其他内容' };
    },
    job(id, action, enableTarget) {
      const store = getStore(), job = store.job(id);
      if (!job || !['pause', 'resume'].includes(action)) fail('任务不存在');
      if (enableTarget !== undefined && typeof enableTarget !== 'boolean') fail('无效的博主开关值');
      if (action === 'resume' && store.target(job.uid).capture_mode === 'pending') fail('请先确认记录方式');
      if (action === 'resume' && job.status === 'complete') fail('历史任务已到可访问末尾；更新任务仍会持续检查');
      store.transaction(() => {
        if (action === 'resume' && enableTarget === true && !store.getSetting('targetEnabled:' + job.uid, true)) {
          for (const other of store.jobs().filter(other => other.uid === job.uid && other.kind !== job.kind && other.status === 'queued')) store.updateJob(other.id, { status: 'paused', message: '保留原博主关闭状态，等待单独开启' });
          store.setSetting('targetEnabled:' + job.uid, true);
        }
        if (action === 'resume' && job.kind === 'history') store.setSetting('historyRequested:' + job.uid, true);
        store.updateJob(job.id, { status: action === 'pause' ? 'paused' : 'queued', message: action === 'pause' ? '已手动暂停，断点保留' : '等待继续；账号冷却仍然有效' });
      })();
      wake();
      const ready = store.monitoringEnabled(store.target(job.uid).platform, job.uid) && store.account(store.target(job.uid).platform).status === 'ready';
      return { id, uid: job.uid, kind: job.kind, status: store.job(id).status, canRun: ready,
        note: action === 'resume' && !ready ? '任务已开启，但账号、平台或总控尚未就绪，请到连接与设置查看' : '配置已生效，运行仍遵守账号冷却和检查时间' };
    },
    add(platform, url) {
      const store = getStore(), source = sources[platform];
      if (!source) fail('此平台尚未接入');
      const externalUid = source.browser.parseAuthor(url), uid = store.authorKey(externalUid, platform);
      if (store.target(uid)) fail('此博主已在关注列表中');
      store.addTarget(externalUid, externalUid, Date.now(), platform, { archiveHistory: false, captureMode: 'from_now' });
      store.db.prepare('UPDATE targets SET record_from=? WHERE uid=?').run(Date.now(), uid);
      wake();
      return { uid, platform, mode: 'from_now', taskId: store.jobs().find(job => job.uid === uid && job.kind === 'updates').id,
        note: '已创建从现在记录的监控任务，历史缓存未开启；资料将在账号可用时读取，平台或总控暂停时不自动开启' };
    },
  };
}
