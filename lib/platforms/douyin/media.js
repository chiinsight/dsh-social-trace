export function mediaURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && /(^|\.)(douyin\.com|douyinvod\.com|douyinpic\.com|douyinstatic\.com|byteimg\.com|ibytedtos\.com|bytecdn\.cn|pstatp\.com|amemv\.com|snssdk\.com)$/.test(url.hostname)) return url.href;
  } catch {}
  return null;
}

export const firstURL = value => (value?.url_list || []).map(mediaURL).find(Boolean) || null;
export const avatar = user => firstURL(user?.avatar_larger) || firstURL(user?.avatar_medium) || firstURL(user?.avatar_thumb);
export const images = raw => (raw?.images || []).slice(0, 18).map(firstURL).filter(Boolean);
