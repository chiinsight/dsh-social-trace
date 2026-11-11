import { isAbsolute } from 'node:path';

export const defaults = { requestGapMs: 30000, historyGapMs: 120000, intervalMs: 86400000 };
export const defaultConfig = Object.freeze({ times: ['20:00'], repeat: 'daily', platformAI: true, saveVideo: false,
  saveAudio: false, transcribe: false, maxFileMB: 256, python: 'python3', ffmpeg: 'ffmpeg', modelPath: '', threads: 2 });

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultConfig, key))) throw new Error('抖音配置包含无效字段');
  const config = { ...defaultConfig, ...value };
  if (!Array.isArray(config.times) || !config.times.length || config.times.length > 8 || config.times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || !['daily', 'weekdays'].includes(config.repeat)) throw new Error('请选择每天或工作日，并填写1–8个有效检查时间');
  for (const key of ['platformAI', 'saveVideo', 'saveAudio', 'transcribe']) if (typeof config[key] !== 'boolean') throw new Error('请选择有效的保存选项');
  if (!Number.isInteger(config.maxFileMB) || config.maxFileMB < 16 || config.maxFileMB > 2048 || !Number.isInteger(config.threads) || config.threads < 1 || config.threads > 4) throw new Error('单文件上限16–2048MB，转写线程1–4个');
  for (const key of ['python', 'ffmpeg']) if (typeof config[key] !== 'string' || !config[key] || config[key].length > 500 || /[\0\r\n]/.test(config[key]) || !(isAbsolute(config[key]) || /^[\w.-]+$/.test(config[key])) || config[key].startsWith('-')) throw new Error('请填写有效的程序名或完整路径');
  if (typeof config.modelPath !== 'string' || config.modelPath.length > 1000 || config.modelPath.includes('\0') || config.modelPath && !isAbsolute(config.modelPath)) throw new Error('模型目录需要填写本机完整路径');
  return { ...config, times: [...new Set(config.times)].sort() };
}

export function configFor(store, uid = '') {
  return validateConfig({ ...store.getSetting('douyinConfig', defaultConfig), ...(uid ? store.getSetting('douyinConfig:' + uid, null) || {} : {}) });
}

export function nextCheckAt(config, after, inclusive = false) {
  const start = Math.floor((after + 28800000) / 86400000) * 86400000 - 28800000;
  for (let day = 0; day < 8; day++) {
    const at = start + day * 86400000, weekday = new Date(at + 28800000).getUTCDay();
    if (config.repeat === 'weekdays' && [0, 6].includes(weekday)) continue;
    for (const time of [...config.times].sort()) {
      const candidate = at + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60000;
      if (inclusive ? candidate >= after : candidate > after) return candidate;
    }
  }
  throw new Error('抖音检查时间无效');
}
