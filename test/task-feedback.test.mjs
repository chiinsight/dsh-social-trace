import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sandbox = { window: { __ModuleLoader__: { load: registration => registration.factory(() => React) } } };
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replace('    function AddAuthorDialog', '    globalThis.feedback = { monitorStatus, taskProblem, FrequencyFields };\n    function AddAuthorDialog');
vm.runInNewContext(code, sandbox);
const { monitorStatus, taskProblem, FrequencyFields } = sandbox.feedback;

test('历史长文错误指明博主和缓存任务，不误报登录失效', () => {
  const job = { id: 'history', uid: 'one', kind: 'history', status: 'needs_review', message: '长文接口未返回全文，保留断点并暂停' };
  const state = { enabled: true, account: { status: 'ready', cooldown_until: 0 }, targets: [{ uid: 'one', platform: 'weibo', name: '测试博主' }], jobs: [job, { uid: 'one', kind: 'updates', status: 'queued' }] };
  const status = monitorStatus(state);
  assert.equal(status.label, '1 位博主的历史缓存已暂停');
  assert.equal(status.kind, 'partial');
  assert.match(status.reason, /测试博主.*长内容/);
  assert.match(taskProblem(job), /已保存内容保留/);
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
