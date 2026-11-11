import { platformModule, platformModules } from './platforms/registry.js';
export { plainText } from './plain-text.js';
export { weiboAvatar, weiboImages } from './platforms/weibo/media.js';

export const platformImage = (value, platform = 'weibo') => platformModule(platform).image?.(value) || null;
export const platformImages = (raw, platform = 'weibo') => platformModule(platform).images?.(raw) || [];
export const imageReferer = value => {
  const url = new URL(value).href;
  return Object.values(platformModules).find(module => module.image?.(url))?.referer || 'https://weibo.com/';
};
