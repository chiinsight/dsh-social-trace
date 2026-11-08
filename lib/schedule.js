import { CaptureError } from './capture-error.js';

const DAY = 86400000, OFFSET = 8 * 3600000;
const minutes = text => typeof text === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? Number(text.slice(0, 2)) * 60 + Number(text.slice(3)) : NaN;
const dateDay = text => typeof text === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(Date.parse(text)).toISOString().slice(0, 10) === text ? Date.parse(text) / DAY : NaN;
const anchor = window => window.repeat && !['daily', 'weekdays'].includes(window.repeat) ? dateDay(window.date) : -Infinity;

export function alignedCheckAt(after, intervalMs, inclusive = false) {
  const from = after + (inclusive ? 0 : 1);
  if (intervalMs <= DAY) {
    const midnight = Math.floor((from + OFFSET) / DAY) * DAY - OFFSET;
    return Math.min(midnight + Math.ceil((from - midnight) / intervalMs) * intervalMs, midnight + DAY);
  }
  const monday = Date.UTC(1970, 0, 5) - OFFSET;
  return monday + Math.ceil((from - monday) / intervalMs) * intervalMs;
}

// Dates are integer Beijing calendar days. Cross-midnight windows belong to their start date.
function nextDay(window, from) {
  const repeat = window.repeat || 'daily', first = anchor(window);
  if (repeat === 'daily') return from;
  if (repeat === 'weekdays') {
    const weekday = new Date(from * DAY).getUTCDay();
    return from + (weekday === 6 ? 2 : weekday === 0 ? 1 : 0);
  }
  if (repeat === 'once') return from <= first ? first : Infinity;
  from = Math.max(from, first);
  if (repeat === 'weekly' || repeat === 'biweekly') {
    const period = repeat === 'weekly' ? 7 : 14;
    return first + Math.ceil((from - first) / period) * period;
  }
  const base = new Date(first * DAY), current = new Date(from * DAY);
  let year = current.getUTCFullYear(), month = repeat === 'monthly' ? current.getUTCMonth() : base.getUTCMonth();
  for (let attempt = 0; attempt < 9; attempt++) {
    const stamp = Date.UTC(year, month, base.getUTCDate()), candidate = new Date(stamp);
    if (candidate.getUTCMonth() === month && stamp / DAY >= from) return stamp / DAY;
    if (repeat === 'monthly') { month++; if (month === 12) { month = 0; year++; } } else year++;
  }
  return Infinity;
}
function span(window, day) {
  const start = minutes(window.start), end = minutes(window.end);
  return [day * DAY - OFFSET + start * 60000, day * DAY - OFFSET + (end + (end < start ? 1440 : 0)) * 60000];
}
function overlaps(a, b) {
  const from = Math.max(Number.isFinite(anchor(a)) ? anchor(a) : 0, Number.isFinite(anchor(b)) ? anchor(b) : 0) - 1;
  // The Gregorian calendar and biweekly phase both repeat after 800 years.
  const simple = [a, b].every(window => ['daily', 'weekdays', 'weekly', 'biweekly'].includes(window.repeat || 'daily'));
  const end = from + (simple ? 16 : 292196);
  let left = nextDay(a, from), right = nextDay(b, from);
  while (left <= end && right <= end) {
    const x = span(a, left), y = span(b, right);
    if (x[0] < y[1] && y[0] < x[1]) return true;
    if (x[1] <= y[0]) left = nextDay(a, left + 1); else right = nextDay(b, right + 1);
  }
  return false;
}

export function validateSchedule(value) {
  if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean' || !Number.isInteger(value.fallbackMinutes) || value.fallbackMinutes < 1 || value.fallbackMinutes > 10080 || !Array.isArray(value.windows) || value.windows.length > 12) {
    throw new CaptureError('input', '请设置有效的分时频率（1–10080 分钟，最多 12 个时间段）');
  }
  const windows = value.windows.map(window => {
    if (!window || typeof window !== 'object') throw new CaptureError('input', '请填写有效时间段');
    const start = minutes(window.start || ''), end = minutes(window.end || '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end || !Number.isInteger(window.intervalMinutes) || window.intervalMinutes < 1 || window.intervalMinutes > 10080) throw new CaptureError('input', '时间段需要有效起止时间和整数分钟，起止不能相同');
    const repeat = window.repeat || 'daily';
    if (!['daily', 'weekdays', 'once', 'weekly', 'biweekly', 'monthly', 'yearly'].includes(repeat)) throw new CaptureError('input', '请选择有效的重复方式');
    if (!['daily', 'weekdays'].includes(repeat) && !Number.isFinite(dateDay(window.date))) throw new CaptureError('input', '请为单次或重复时间段填写有效的首次日期');
    return { start: window.start, end: window.end, intervalMinutes: window.intervalMinutes, ...(window.repeat ? { repeat, ...(!['daily', 'weekdays'].includes(repeat) ? { date: window.date } : {}) } : {}) };
  });
  for (let i = 0; i < windows.length; i++) for (let j = 0; j < i; j++) if (overlaps(windows[i], windows[j])) throw new CaptureError('input', '监控时间段不能重叠（请检查重复日期与跨午夜时间）');
  return { enabled: value.enabled, fallbackMinutes: value.fallbackMinutes, windows };
}

export function intervalAt(schedule, fallbackMs, now) {
  if (!schedule?.enabled) return fallbackMs;
  const today = Math.floor((now + OFFSET) / DAY);
  const window = schedule.windows.find(window => {
    for (const day of [today - 1, today]) if (nextDay(window, day) === day) {
      const [start, end] = span(window, day);
      if (now >= start && now < end) return true;
    }
    return false;
  });
  return (window?.intervalMinutes ?? schedule.fallbackMinutes) * 60000;
}

export function nextBoundary(schedule, now) {
  if (!schedule?.enabled || !schedule.windows.length) return Infinity;
  const today = Math.floor((now + OFFSET) / DAY);
  let result = Infinity;
  for (const window of schedule.windows) {
    let day = nextDay(window, today - 1);
    for (let attempt = 0; attempt < 3 && Number.isFinite(day); attempt++) {
      for (const point of span(window, day)) if (point > now) result = Math.min(result, point);
      if (span(window, day)[0] > now) break;
      day = nextDay(window, day + 1);
    }
  }
  return result;
}
