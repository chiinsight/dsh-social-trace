import test from 'node:test';
import assert from 'node:assert/strict';
import { alignedCheckAt, intervalAt, nextBoundary, validateSchedule } from '../lib/schedule.js';

const plan = validateSchedule({ enabled: true, fallbackMinutes: 60, windows: [{ start: '08:00', end: '15:00', intervalMinutes: 1 }] });
const time = text => Date.parse('2026-11-05T' + text + '+08:00');

test('北京时间分时：08:00 含起点，15:00 切回每小时，其他时区主机结果一致', () => {
  for (const [clock, expected] of [['07:59:59', 60], ['08:00:00', 1], ['14:59:59', 1], ['15:00:00', 60], ['23:59:00', 60]]) assert.equal(intervalAt(plan, 900000, time(clock)), expected * 60000);
  assert.equal(nextBoundary(plan, time('07:59:59')), time('08:00:00'));
  assert.equal(nextBoundary(plan, time('08:00:00')), time('15:00:00'));
  assert.equal(intervalAt({ ...plan, enabled: false }, 300000, time('09:00:00')), 300000);
});

test('跨午夜和多个相邻时段；拒绝重叠、无效时间和小数分钟', () => {
  const overnight = validateSchedule({ enabled: true, fallbackMinutes: 60, windows: [{ start: '22:00', end: '02:00', intervalMinutes: 2 }, { start: '02:00', end: '08:00', intervalMinutes: 10 }] });
  assert.equal(intervalAt(overnight, 900000, time('00:30:00')), 120000);
  assert.equal(intervalAt(overnight, 900000, time('02:00:00')), 600000);
  for (const window of [{ start: '09:00', end: '16:00', intervalMinutes: 1 }, { start: '24:00', end: '06:00', intervalMinutes: 1 }, { start: '00:00', end: '00:00', intervalMinutes: 1 }, { start: '16:00', end: '17:00', intervalMinutes: .5 }]) assert.throws(() => validateSchedule({ ...plan, windows: [...plan.windows, window] }));
});

const at = text => Date.parse(text + '+08:00');
const recurring = (repeat, date, extra = {}) => validateSchedule({ enabled: true, fallbackMinutes: 60, windows: [{ start: '09:00', end: '15:00', intervalMinutes: 1, repeat, date, ...extra }] });

test('单次时间段仅在指定日期生效，结束后不再产生边界', () => {
  const schedule = recurring('once', '2026-11-06');
  assert.equal(intervalAt(schedule, 1, at('2026-11-06T09:00:00')), 60000);
  assert.equal(intervalAt(schedule, 1, at('2026-11-07T09:00:00')), 3600000);
  assert.equal(nextBoundary(schedule, at('2026-11-05T15:00:00')), at('2026-11-06T09:00:00'));
  assert.equal(nextBoundary(schedule, at('2026-11-06T15:00:00')), Infinity);
});

test('每周与每双周从首次日期起执行，不提前生效；边界跳到真正下一次', () => {
  for (const [repeat, next] of [['weekly', '2026-11-13'], ['biweekly', '2026-11-20']]) {
    const schedule = recurring(repeat, '2026-11-06');
    assert.equal(intervalAt(schedule, 1, at('2026-10-30T10:00:00')), 3600000);
    assert.equal(intervalAt(schedule, 1, at('2026-11-06T10:00:00')), 60000);
    assert.equal(intervalAt(schedule, 1, at('2026-11-07T10:00:00')), 3600000);
    assert.equal(nextBoundary(schedule, at('2026-11-06T15:00:00')), at(next + 'T09:00:00'));
  }
  assert.equal(intervalAt(recurring('biweekly', '2026-11-06'), 1, at('2026-11-13T10:00:00')), 3600000);
});

test('月末与闰年使用真实日历，无对应日期则跳过；北京时间跨年边界正确', () => {
  const monthly = recurring('monthly', '2026-01-31');
  assert.equal(nextBoundary(monthly, at('2026-01-31T15:00:00')), at('2026-03-31T09:00:00'));
  assert.equal(intervalAt(monthly, 1, at('2026-02-28T10:00:00')), 3600000);
  const leap = recurring('yearly', '2096-02-29');
  assert.equal(nextBoundary(leap, at('2096-02-29T15:00:00')), at('2104-02-29T09:00:00'));
  assert.equal(nextBoundary(recurring('yearly', '2026-01-01'), at('2026-12-31T23:59:59')), at('2027-01-01T09:00:00'));
});

test('跨午夜属于起始日期，结束后的其他时间仍使用兜底频率', () => {
  const schedule = recurring('weekly', '2026-11-06', { start: '22:00', end: '02:00' });
  assert.equal(intervalAt(schedule, 1, at('2026-11-07T01:59:59')), 60000);
  assert.equal(intervalAt(schedule, 1, at('2026-11-07T02:00:00')), 3600000);
  assert.equal(nextBoundary(schedule, at('2026-11-06T23:00:00')), at('2026-11-07T02:00:00'));
});

test('按实际重复日期校验重叠：不同星期可同一时刻，跨日与闰日冲突不能漏掉', () => {
  const window = { start: '09:00', end: '15:00', intervalMinutes: 1 };
  const check = windows => validateSchedule({ enabled: true, fallbackMinutes: 60, windows });
  assert.doesNotThrow(() => check([{ ...window, repeat: 'weekly', date: '2026-11-06' }, { ...window, repeat: 'weekly', date: '2026-11-07' }]));
  assert.doesNotThrow(() => check([{ ...window, repeat: 'biweekly', date: '2026-11-06' }, { ...window, repeat: 'biweekly', date: '2026-11-13' }]));
  assert.throws(() => check([{ ...window, repeat: 'weekly', date: '2026-11-06', start: '22:00', end: '02:00' }, { ...window, repeat: 'once', date: '2026-11-07', start: '01:00', end: '03:00' }]), /不能重叠/);
  assert.throws(() => check([{ ...window, repeat: 'yearly', date: '2096-02-29' }, { ...window, repeat: 'monthly', date: '2097-01-29' }]), /不能重叠/);
  for (const [repeat, date] of [['invalid', '2026-11-06'], ['weekly', ''], ['once', '2026-02-30'], ['monthly', '2026-13-01']]) assert.throws(() => recurring(repeat, date));
});

test('工作日周一至周五，周末切回其他时间；周五跨午夜可延续至周六', () => {
  const schedule = recurring('weekdays', undefined);
  assert.equal(intervalAt(schedule, 1, at('2026-11-06T10:00:00')), 60000);
  for (const date of ['2026-11-07', '2026-11-08']) assert.equal(intervalAt(schedule, 1, at(date + 'T10:00:00')), 3600000);
  assert.equal(nextBoundary(schedule, at('2026-11-06T15:00:00')), at('2026-11-09T09:00:00'));
  const night = recurring('weekdays', undefined, { start: '22:00', end: '02:00' });
  assert.equal(intervalAt(night, 1, at('2026-11-07T01:00:00')), 60000);
  assert.equal(intervalAt(night, 1, at('2026-11-08T01:00:00')), 3600000);
  assert.equal(validateSchedule(schedule).windows[0].repeat, 'weekdays');
});


test('检查对齐北京时间刻度，与创建或上次检查分钟秒数无关', () => {
  assert.equal(alignedCheckAt(at('2026-11-06T22:25:18'), 3600000), at('2026-11-06T23:00:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T22:55:59'), 3600000), at('2026-11-06T23:00:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T22:25:18'), 60000), at('2026-11-06T22:26:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T22:25:18'), 900000), at('2026-11-06T22:30:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T23:55:00'), 900000), at('2026-11-07T00:00:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T23:00:00'), 3600000), at('2026-11-07T00:00:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T23:00:00'), 3600000, true), at('2026-11-06T23:00:00'));
  assert.equal(alignedCheckAt(at('2026-11-06T22:25:18'), 7 * 86400000), at('2026-11-09T00:00:00'));
});
