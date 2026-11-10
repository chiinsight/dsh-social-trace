import { validateSchedule } from './schedule.js';
import { CaptureError } from './capture-error.js';

export function createBusiness(getStore, sources, drainImages) {
  const fail = text => { throw new CaptureError('input', text); };
  const wake = () => { Object.values(sources).forEach(source => { source.worker.rescheduleUpdates(); source.worker.wake(); }); drainImages(); };
  return {
    policy(body) {
      const store = getStore(), target = store.target(body.uid);
      if (!target || target.platform !== body.platform || typeof body.inherit !== 'boolean') fail('请选择有效的博主设置');
      const interval = Number(body.intervalMinutes);
      if (!body.inherit && (!Number.isInteger(interval) || interval < 1 || interval > 10080)) fail('检查间隔为 1–10080 分钟');
      const policy = body.inherit ? null : { intervalMs: interval * 60000, schedule: validateSchedule(body.schedule) };
      store.setSetting('targetPolicy:' + target.uid, policy); wake();
      return { uid: target.uid, policy: store.monitoringPolicy(target) };
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
