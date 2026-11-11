import { configFor, validateConfig, defaultConfig } from './config.js';
import { CaptureError } from '../../capture-error.js';

const frequencyKeys = ['times', 'repeat'];
const mediaKeys = Object.keys(defaultConfig).filter(key => !frequencyKeys.includes(key));

export function saveConfig(store, body, { media, worker }) {
  if (body.platform !== 'douyin' || body.uid && store.target(body.uid)?.platform !== 'douyin'
    || body.inherit !== undefined && typeof body.inherit !== 'boolean'
    || !['all', 'frequency', 'media'].includes(body.section || 'all')) throw new CaptureError('input', '请选择有效的抖音配置对象');
  let config;
  try {
    if (body.uid && body.inherit === true) config = null;
    else {
      // Validate the whole input, then merge only the section being edited with current saved values.
      const input = validateConfig(body.config), allowed = body.section === 'frequency' ? frequencyKeys : body.section === 'media' ? mediaKeys : Object.keys(defaultConfig);
      const keys = Object.keys(body.config).filter(key => allowed.includes(key));
      config = validateConfig({ ...configFor(store, body.uid || ''), ...Object.fromEntries(keys.map(key => [key, input[key]])) });
    }
  } catch (error) { throw new CaptureError('input', error.message); }
  store.setSetting(body.uid ? 'douyinConfig:' + body.uid : 'douyinConfig', config);
  media.configure(body.uid || ''); worker.rescheduleUpdates(); worker.wake();
}

export function status(store, media) {
  return { config: configFor(store), overrides: Object.fromEntries(store.targets().filter(target => target.platform === 'douyin').map(target => [target.uid, store.getSetting('douyinConfig:' + target.uid, null)])),
    counts: store.db.prepare("SELECT uid,SUM(json_extract(metadata,'$.imagePost')=0) AS videos,SUM(json_extract(metadata,'$.imagePost')=1) AS images FROM video_records GROUP BY uid").all(),
    processing: !!media.busy, revision: store.db.prepare('SELECT MAX(updated_at) AS at FROM video_records').get().at || 0 };
}

export function validatePublicConfig(store, uid, options) {
  if (Object.keys(options).some(key => !['times', 'repeat', 'saveVideo', 'saveAudio', 'platformAI', 'transcribe'].includes(key))) throw new CaptureError('input', '无效的公开抖音选项');
  return validateConfig({ ...configFor(store, uid), ...options });
}
