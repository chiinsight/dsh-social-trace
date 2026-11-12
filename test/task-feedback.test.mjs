import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sandbox = { window: { __ModuleLoader__: { load: registration => registration.factory(() => React) } } };
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replace('    function AddAuthorDialog', '    globalThis.feedback = { monitorStatus, taskProblem, FrequencyFields, NodeSettings, ContentProblem, CheckHealthNotice };\n    function AddAuthorDialog');
vm.runInNewContext(code, sandbox);
const { monitorStatus, taskProblem, FrequencyFields, NodeSettings, ContentProblem, CheckHealthNotice } = sandbox.feedback;

test('历史长文错误指明博主和缓存任务，不误报登录失效', () => {
  const job = { id: 'history', uid: 'one', kind: 'history', status: 'needs_review', message: '长文接口未返回全文，保留断点并暂停' };
  const state = { enabled: true, account: { status: 'ready', cooldown_until: 0 }, targets: [{ uid: 'one', platform: 'weibo', name: '测试博主' }], jobs: [job, { uid: 'one', kind: 'updates', status: 'queued' }] };
  const status = monitorStatus(state);
  assert.equal(status.label, '测试博主：有微博未读完整');
  assert.equal(status.kind, 'partial');
  assert.match(status.reason, /测试博主.*全文/);
  assert.match(taskProblem(job), /已有内容保留/);
  assert.doesNotMatch(status.label, /登录|任务需检查/);
});

test('频率主文案只说明多久检查，时钟对齐留在辅助说明', () => {
  const html = renderToStaticMarkup(React.createElement(FrequencyFields, {
    value: { intervalMinutes: 60, schedule: { enabled: true, fallbackMinutes: 60, windows: [{ repeat: 'weekdays', start: '09:00', end: '15:00', intervalMinutes: 1 }] } }, change() {}, disabled: false,
  }));
  assert.match(html, /工作日（周一至周五）/);
  assert.match(html, /每 1 分钟检查一次/);
  assert.match(html, /每小时检查一次/);
  assert.match(html, /60 分钟为整点/);
  assert.doesNotMatch(html, /每分钟00秒/);
});

test('账号已登录但检查延迟时不能显示正常，暂停任务不误报延迟', () => {
  const state = { enabled: true, account: { status: 'ready', cooldown_until: 0 }, targets: [{ uid: 'one', platform: 'weibo', name: '测试' }],
    jobs: [{ uid: 'one', kind: 'updates', status: 'queued' }],
    platforms: [{ id: 'weibo', enabled: true, health: { activeAuthors: 15, capacityLimited: false, minimumCycleMs: 45000, delayed: [{ uid: 'one', lateMs: 120000 }] } }] };
  assert.equal(monitorStatus(state).label, '检查延迟');
  assert.equal(monitorStatus(state).kind, 'partial');
  assert.match(monitorStatus(state).reason, /未按设定频率/);
  state.jobs[0].status = 'paused';
  assert.equal(monitorStatus(state).kind, 'paused');
  state.jobs[0].status = 'queued'; state.account.cooldown_until = Date.now() + 60000; state.account.errors = 1;
  assert.equal(monitorStatus(state).kind, 'cooldown');
});

test('频率设置能区分接口返回的最新时间、读取失败和正文补全失败', () => {
  const state = { enabled: true, account: { status: 'ready', cooldown_until: 0 },
    targets: [{ uid: 'one', platform: 'weibo', name: '测试', interval_ms: 60000 }],
    jobs: [{ id: 'updates', uid: 'one', kind: 'updates', status: 'queued' }],
    platforms: [{ id: 'weibo', enabled: true, health: { activeAuthors: 1, capacityLimited: false, delayed: [{ uid: 'one' }] } }],
    progress: [{ uid: 'one', recentChecks: [
      { at: 100000, page: 1, status: 'success', count: 20, newestPublishedAt: 90000 },
      { at: 200000, page: 1, stage: 'timeline', status: 'network' },
      { at: 300000, page: 1, stage: 'complete', status: 'network' },
    ], history: {} }] };
  const html = renderToStaticMarkup(React.createElement(NodeSettings, { context: { scope: 'target', uid: 'one', platform: 'weibo' }, state, embedded: true }));
  assert.match(html, /测试/);
  assert.match(html, /新动态检查有延迟/);
  assert.match(html, /最近检查记录/);
  assert.match(html, /返回的最新发布时间/);
  assert.match(html, /返回 20 条/);
  assert.match(html, /动态列表读取失败/);
  assert.match(html, /正文补全失败/);
});

test('重试中明确说明时间且无重试按钮，耗尽后指向原微博和保留片段跳过', () => {
  const job = { id: 'history', uid: 'one', kind: 'history', status: 'queued', contentIssue: { stage: '微博正文', postId: '100000000001', url: 'https://weibo.com/detail/100000000001', excerpt: '未读完整内容的开头', attempts: 1, maxAttempts: 3, nextRetryAt: Date.now() + 60000, exhausted: false } };
  const html = renderToStaticMarkup(React.createElement(ContentProblem, { job, name: '测试博主', act() {} }));
  assert.match(html, /无需操作/); assert.match(html, /自动重试/); assert.match(html, /未读完整内容的开头/);
  assert.doesNotMatch(html, /<button/);
  const failed = renderToStaticMarkup(React.createElement(ContentProblem, { job: { ...job, status: 'needs_review', contentIssue: { ...job.contentIssue, attempts: 3, exhausted: true } }, name: '测试博主', act() {} }));
  assert.match(failed, /https:\/\/weibo.com\/detail\/100000000001/); assert.match(failed, /跳过这条，继续缓存/); assert.match(failed, /不标记为全文/);
  assert.doesNotMatch(failed, /重试历史缓存/);
});


test('平台延迟提示列出具体博主、UID、完成时间与延迟，不猜原因；入口指向该博主', () => {
  const state = { targets: [{ uid: 'one', name: '甲博主', platform: 'weibo' }, { uid: 'two', name: '乙博主', platform: 'weibo' }],
    jobs: [{ id: 'j1', uid: 'one', kind: 'updates' }, { id: 'j2', uid: 'two', kind: 'updates' }], activeJobIds: ['j1'], progress: [] };
  const source = { id: 'weibo', health: { delayed: [{ uid: 'one', lastCheckedAt: 1794445200000, lateMs: 125000 }, { uid: 'two', lastCheckedAt: null, lateMs: 8000 }] } };
  let opened;
  const element = CheckHealthNotice({ state, source, openSettings: value => { opened = value; } });
  const html = renderToStaticMarkup(element);
  assert.match(html, /甲博主/); assert.match(html, /乙博主/); assert.match(html, /UID one/);
  assert.match(html, /2026/); assert.match(html, /3 分钟/); assert.match(html, /8 秒/);
  assert.match(html, /正在检查/); assert.match(html, /原因尚未确认/); assert.match(html, /尚无完成记录/);
  assert.doesNotMatch(html, /登录正常不代表|1 位博主未/);
  const buttons = [];
  const visit = node => { if (!node || typeof node !== 'object') return; if (node.type === 'button') buttons.push(node); React.Children.forEach(node.props?.children, visit); };
  visit(element); buttons[1].props.onClick();
  assert.equal(opened.uid, 'two'); assert.equal(opened.platform, 'weibo'); assert.equal(opened.tab, 'frequency');
  const filtered = renderToStaticMarkup(React.createElement(CheckHealthNotice, { state, source, uid: 'two' }));
  assert.doesNotMatch(filtered, /甲博主/); assert.match(filtered, /乙博主/);
});
