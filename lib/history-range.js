import { CaptureError } from './capture-error.js';
export function parseHistoryRange(from, to, now = Date.now()) {
  const parse = (value, end) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CaptureError('input', '请选择有效的日期');
    const start = Date.parse(value + 'T00:00:00+08:00');
    if (!Number.isFinite(start) || new Date(start + 8 * 3600000).toISOString().slice(0, 10) !== value) throw new CaptureError('input', '请选择有效的日期');
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    if (value > today) throw new CaptureError('input', '历史归档日期不能晚于今天');
    return start + (end ? 86400000 - 1 : 0);
  };
  const start = parse(from, false), end = parse(to, true);
  if (start !== null && end !== null && start > end) throw new CaptureError('input', '开始日期不能晚于结束日期');
  return { from: start, to: end };
}
