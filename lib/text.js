import he from 'he';
import { xueqiuImage, xueqiuImages } from './platforms/xueqiu/media.js';

export const platformImage = (value, platform) => platform === 'xueqiu' ? xueqiuImage(value) : weiboAvatar({ avatar_hd: value });
export const platformImages = (raw, platform) => platform === 'xueqiu' ? xueqiuImages(raw) : weiboImages(raw);
export const imageReferer = value => /(^|\.)imedao\.com$/.test(new URL(value).hostname) ? 'https://xueqiu.com/' : 'https://weibo.com/';

export function plainText(html = '') {
  return he.decode(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')).trim();
}

export function weiboAvatar(user) {
  for (const value of [user?.avatar_hd, user?.avatar_large, user?.profile_image_url]) {
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && /(^|\.)sinaimg\.(cn|com)$/.test(url.hostname) && !url.username && !url.password && !url.port) {
        url.protocol = 'https:';
        return url.href;
      }
    } catch { /* Missing or invalid image fields fall back to the author's initial. */ }
  }
  return null;
}

export function weiboImages(raw) {
  const pictures = raw?.pic_infos
    ? (raw.pic_ids?.length ? raw.pic_ids.map(id => raw.pic_infos[id]) : Object.values(raw.pic_infos))
    : Array.isArray(raw?.pics) ? raw.pics : [];
  return [...new Set(pictures.slice(0, 18).map(pic => weiboAvatar({ avatar_hd: pic?.large?.url || pic?.largest?.url || pic?.original?.url || pic?.bmiddle?.url || pic?.url })).filter(Boolean))];
}
