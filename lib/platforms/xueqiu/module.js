import { xueqiuImage, xueqiuImages } from './media.js';

export const platformModule = { id: 'xueqiu', name: '雪球', intervalScheduling: true,
  image: xueqiuImage, images: xueqiuImages, referer: 'https://xueqiu.com/',
  isArticle: raw => String(raw.type) === '3' && !!raw.title };
