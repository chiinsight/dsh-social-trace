import { mediaURL, images } from './media.js';
import { configFor, nextCheckAt } from './config.js';
import { initializeStorage, saveMedia, preparePost, decoratePost, filterPosts, searchPosts } from './storage.js';

export const platformModule = {
  id: 'douyin', name: '抖音', intervalScheduling: false,
  image: mediaURL, images, referer: 'https://www.douyin.com/',
  transientConnectionFailure: error => /抖音作品列表加载超时|未收到抖音作品列表/.test(error.message || ''),
  recoverLegacyConnection: account => account.status === 'needs_verification' && /未收到抖音作品列表/.test(account.reason || ''),
  scheduleHelp: '抖音按每天时间点检查，请在详细设置调整',
  initializeStorage, saveMedia, preparePost, decoratePost, filterPosts, searchPosts,
  nextCheckAt: (store, target, after, inclusive = false) => nextCheckAt(configFor(store, target.uid), after, inclusive),
  publicConfig(store, target) {
    const config = configFor(store, target.uid);
    return { dailySchedule: { times: config.times, repeat: config.repeat },
      contentOptions: Object.fromEntries(['saveVideo', 'saveAudio', 'platformAI', 'transcribe'].map(key => [key, config[key]])) };
  },
};
