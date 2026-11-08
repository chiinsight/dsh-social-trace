import { readFileSync } from 'node:fs';
import { createPluginUpdater } from '@morehao/dsh-plugin-kit/update';

const meta = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const messages = {
  NO_MANAGER: '当前 Harness 未提供一键更新能力，请使用下方命令更新。',
  LINKED_INSTALL: '当前使用本地源码安装，请手动更新源码，或改用 npm 版本安装。',
  NOT_CHECKED: '请先检查并获取最新版本。',
  NO_UPDATE: '当前没有可安装的新版。',
  INVALID_VERSION: '版本已变化，请重新检查更新。',
  APPLY_IN_PROGRESS: '更新正在进行，请稍候。',
  ROLLBACK_FAILED: '更新与自动恢复均未完成，请使用下方命令重新安装插件。本地资料仍保留。',
};

export function createUpdates({ getService = () => null, fetchImpl = fetch, ...options } = {}) {
  const manager = () => {
    const host = getService('pluginManager');
    if (!host) return null;
    const service = {};
    for (const method of ['installBundle', 'removeBundle']) if (typeof host[method] === 'function') service[method] = async value => {
      try { return await host[method](value); }
      catch (reason) { return { error: { code: reason?.code || 'operation-failed', message: '插件管理器操作未完成' } }; }
    };
    if (typeof host.registries === 'function') service.registries = host.registries.bind(host);
    return service;
  };
  const engine = createPluginUpdater({ meta, getPluginManager: manager,
    getProfile: () => getService('profileContext'), fetchImpl, ...options });
  let phase = 'idle', result = null, error = '', task = null;
  const view = () => {
    const checked = engine.view();
    return { currentVersion: meta.version, latestVersion: checked?.latestVersion || null,
      updateAvailable: checked?.updateAvailable === true, checkFailed: checked?.checkFailed === true,
      checkedAt: checked?.checkedAt || null, canApply: checked?.canApply === true,
      installKind: checked?.installKind || 'unknown', manualCommand: checked?.manualCommand || `dsh plugin --profile desktop add ${meta.name}@latest`,
      phase, result, error, homepage: meta.homepage };
  };
  return {
    view,
    async check(fresh = false) { if (!['applying', 'complete', 'restart-required', 'overridden'].includes(phase)) { phase = 'idle'; error = ''; } await engine.check({ fresh }); return view(); },
    start(version, run = apply => apply()) {
      const current = view();
      const fail = code => { throw Object.assign(new Error(messages[code]), { code }); };
      if (phase === 'applying') fail('APPLY_IN_PROGRESS');
      if (!current.checkedAt || current.checkFailed) fail('NOT_CHECKED');
      if (!current.updateAvailable) fail('NO_UPDATE');
      if (version !== current.latestVersion) fail('INVALID_VERSION');
      if (!current.canApply) fail(['link', 'file', 'workspace'].includes(current.installKind) ? 'LINKED_INSTALL' : 'NO_MANAGER');
      phase = 'applying'; error = ''; result = null;
      task = Promise.resolve().then(() => run(() => engine.apply({ version }))).then(value => {
        result = { updatedVersion: value.updatedVersion, restartRequired: value.restartRequired, application: value.application };
        phase = value.application === 'overridden' ? 'overridden' : value.restartRequired ? 'restart-required' : 'complete';
      }).catch(reason => {
        phase = 'failed';
        error = messages[reason?.code] || '更新失败，请重试或使用下方命令重新安装。';
      });
      return view();
    },
    async settled() { if (task) await task; return view(); },
  };
}
