import { contentProblem, contentRetryDelays } from './recovery.js';
import { weiboAvatar, weiboImages } from './media.js';

export const platformModule = { id: 'weibo', name: '微博', intervalScheduling: true, contentProblem, contentRetryDelays,
  image: value => weiboAvatar({ avatar_hd: value }), images: weiboImages, referer: 'https://weibo.com/' };
