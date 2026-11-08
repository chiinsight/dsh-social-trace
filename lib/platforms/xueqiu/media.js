export function xueqiuImage(value) {
  try {
    const url = new URL(String(value).startsWith('//') ? 'https:' + value : value);
    if (!['http:', 'https:'].includes(url.protocol) || !/(^|\.)imedao\.com$/.test(url.hostname) || url.username || url.password || url.port) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function xueqiuAvatar(user) {
  const values = String(user?.profile_image_url || '').split(',').filter(Boolean);
  values.sort((a, b) => Number(b.includes('180x180')) - Number(a.includes('180x180')));
  for (const value of values) {
    const direct = xueqiuImage(value);
    if (direct) return direct;
    try { const image = xueqiuImage(new URL(value, user.photo_domain?.startsWith('//') ? 'https:' + user.photo_domain : user.photo_domain).href); if (image) return image; } catch {}
  }
  return null;
}

export function xueqiuImages(raw) {
  const values = (Array.isArray(raw?.image_info_list) ? raw.image_info_list : []).map(image => image.url || (image.filename ? 'https://xqimg.imedao.com/' + image.filename : ''));
  for (const match of String(raw?.text || raw?.description || '').matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) values.push(match[1].replace(/&amp;/g, '&'));
  return [...new Set(values.map(xueqiuImage).filter(Boolean))].slice(0, 18);
}
