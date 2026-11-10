import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function component(react = React) {
  let result;
  const sandbox = { window: { __ModuleLoader__: { load: registration => { result = registration.factory(() => react); } } } };
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replace('    function AddAuthorDialog', '    globalThis.AgentSettingsForTest = AgentSettings; globalThis.PostTimesForTest = PostTimes; globalThis.IMSummaryForTest = IMSummary;\n    function AddAuthorDialog');
  vm.runInNewContext(code, sandbox);
  assert.equal(result.name, 'dsh-social-trace');
  sandbox.AgentSettingsForTest.PostTimes = sandbox.PostTimesForTest;
  sandbox.AgentSettingsForTest.IMSummary = sandbox.IMSummaryForTest;
  return sandbox.AgentSettingsForTest;
}
const config = { enabled: false, botId: 'bot', targetId: 'target', uids: [] };

test('移除微信后侧栏和大屏仅显示当前 QQ 绑定，不展示其他插件的机器人清单', () => {
  const Summary = component().IMSummary;
  const qq = { botId: 'qq', targetId: 'private', channel: 'qq', name: 'QQ 接收人', enabled: true, state: 'configured' };
  const agent = { config: { enabled: true, uids: [], destinations: [qq] }, transportAvailable: true,
    destinations: [qq, { botId: 'wx', targetId: 'old', channel: 'weixin', state: 'failed' }],
    integration: { bots: [{ botId: 'qq', channel: 'qq' }, { botId: 'wx', channel: 'weixin' }] } };
  for (const compact of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(Summary, { agent, compact, onClick: compact ? () => {} : undefined }));
    assert.match(html, /QQ/);
    assert.doesNotMatch(html, /微信|weixin|已接入机器人/);
    if (compact) { assert.match(html, /已连接/); assert.match(html, /st-sidebar-account/); }
  }
});
test('投递通用错误明确定位到 dsh-im，提供检查入口而不编造原因', () => {
  const html = renderToStaticMarkup(React.createElement(component(), {
    state: { targets: [], agent: { config, transportAvailable: true, deliveries: [{ id: 'failure', author: '测试作者', status: 'uncertain', error: 'delivery-failed', created_at: Date.now() }] } },
    act() {}, busy: false, close() {}, initialTab: 'deliveries',
  }));
  assert.match(html, /dsh-im 插件发送失败/);
  assert.match(html, /检查 dsh-im 的机器人连接与接收目标/);
  assert.match(html, /未确认是否送达/);
  assert.doesNotMatch(html, /会话已过期/);
});

function harness(saved = config, available = true, succeeds = true) {
  const slots = [], calls = []; let cursor = 0;
  const state = { targets: [{ uid: 'author', name: '测试博主' }], agent: { config: saved, transportAvailable: available } };
  const react = { ...React, useRef: () => ({ current: null }), useEffect() {}, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = value; }];
  } };
  const Component = component(react);
  const render = () => { cursor = 0; return Component({ state, busy: false, close() {}, act: async (path, body) => { calls.push({ path, body }); if (succeeds && path === '/agent/settings') state.agent.config = body; return succeeds; } }); };
  function find(predicate, node = render()) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    if (typeof node.type === 'function') return find(predicate, node.type(node.props));
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(predicate, child); if (found) return found; }
    return null;
  }
  const text = node => typeof node === 'string' ? node : React.Children.toArray(node?.props?.children).map(text).join('');
  return { state, calls, field: name => find(node => node.props?.['aria-label'] === name), button: name => find(node => node.type === 'button' && text(node) === name), find };
}

test('已配置 Agent 使用设置分组；接入指引与未开放能力默认折叠', () => {
  const html = renderToStaticMarkup(React.createElement(component(), { state: { targets: [], agent: { config, transportAvailable: true } }, act() {}, busy: false, close() {} }));
  assert.match(html, /已添加渠道/); assert.match(html, /添加渠道/); assert.match(html, /投递记录/);
  assert.doesNotMatch(html, /保存接收目标/); assert.match(html, /保存博主范围/);
  assert.doesNotMatch(html, /推送机器人/);
  const addHtml = renderToStaticMarkup(React.createElement(component(), { state: { targets: [], agent: { config, transportAvailable: true } }, act() {}, close() {}, initialTab: 'add' }));
  assert.match(addHtml, /保存接收目标/);
  assert.doesNotMatch(addHtml, /st-destination-row/);
  assert.match(addHtml, /更多设置 → 投递设置 → 新建目标/);
  assert.match(addHtml, /已聊过的会话/); assert.match(addHtml, /微信仅支持个人接收人，不支持群/);
  assert.match(html, /业务 Chat/); assert.match(html, /等待 DSH 模型/);
  assert.match(html, /只保存本地报告/);
  assert.match(addHtml, /<details class="st-setting-help"><summary>如何配置接收目标/);
  assert.doesNotMatch(html, /<ol[^>]*open/);
});

test('未配置时展开接入帮助，已有推送离线仍可关闭', () => {
  const html = renderToStaticMarkup(React.createElement(component(), { state: { targets: [], agent: { config: { ...config, botId: '', targetId: '' }, transportAvailable: false } }, busy: false, close() {}, initialTab: 'add' }));
  assert.match(html, /<details class="st-setting-help" open=""><summary>如何配置接收目标/);
  const h = harness({ ...config, enabled: true }, false);
  const input = h.field('自动推送新动态'); assert.equal(input.props.disabled, false);
  input.props.onChange({ target: { checked: false } });
  assert.equal(h.calls[0].body.enabled, false);
});

for (const [available, botId, targetId, expected] of [
  [false, '', '', /尚未连接 dsh-im/],
  [true, '', '', /请先选择并保存接收目标/],
  [true, 'bot', '', /请先选择并保存接收目标/],
  [true, 'bot', 'target', null],
]) test(`推送开关可点击并校验已保存配置：${available}/${botId}/${targetId}`, () => {
  const h = harness({ ...config, botId, targetId }, available);
  const input = h.field('自动推送新动态'); assert.equal(input.props.disabled, false);
  input.props.onChange({ target: { checked: true } });
  if (expected) {
    const alert = h.find(node => node.props?.role === 'alert');
    assert.match(alert.props.children, expected); assert.equal(h.calls.length, 0);
  } else { assert.equal(h.calls[0].path, '/agent/settings'); assert.equal(h.calls[0].body.enabled, true); }
});

test('设置分组独立保存，编辑目标不会偷偷更改推送范围；保存范围不提交未保存目标', () => {
  const h = harness({ ...config, enabled: true });
  h.button('添加渠道').props.onClick();
  h.field('推送接收目标').props.onChange({ target: { value: 'new-target' } });
  h.button('已添加渠道').props.onClick();
  h.field('推送博主范围').props.onChange({ target: { value: 'selected' } });
  h.button('保存博主范围').props.onClick();
  assert.equal(h.calls[0].body.targetId, 'target');
  assert.equal(h.calls[0].body.enabled, true);
  assert.deepEqual([...h.calls[0].body.uids], ['author']);
  h.button('添加渠道').props.onClick();
  h.button('保存接收目标').props.onClick();
  assert.deepEqual(Array.from(h.calls[1].body.destinations, item => item.targetId), ['target', 'new-target']);
  assert.equal(h.calls[1].body.enabled, true, '添加渠道不关闭原有推送');
  assert.deepEqual([...h.calls[1].body.uids], ['author']);
});

test('投递记录独立页签，切换页签不发送请求', () => {
  const h = harness(); h.state.agent.deliveries = [{ id: 'd1', author: '测试博主', status: 'uncertain', created_at: Date.now(), error: '结果未知' }];
  h.button('投递记录').props.onClick();
  assert.ok(h.find(node => node.type === 'table'));
  assert.equal(h.field('自动推送新动态'), null);
  assert.equal(h.calls.length, 0);
});

test('立即保存开关先响应点击，保存失败后恢复已保存状态', async () => {
  const h = harness({ ...config, enabled: true }, true, false);
  h.field('自动推送新动态').props.onChange({ target: { checked: false } });
  assert.equal(h.field('自动推送新动态').props.checked, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.field('自动推送新动态').props.checked, true);
  assert.equal(h.state.agent.config.enabled, true);
});

test('多目标开关只保存对应目标，立即反馈且失败时恢复', async () => {
  const saved = { enabled: true, uids: [], destinations: [{ botId: 'qq', targetId: 'private', enabled: true }, { botId: 'wx', targetId: 'private', enabled: true }] };
  const h = harness(saved, true, false);
  h.field('推送目标2开关').props.onChange({ target: { checked: false } });
  assert.equal(h.field('推送目标2开关').props.checked, false);
  assert.equal(h.calls[0].body.destinations[0].enabled, true);
  assert.equal(h.calls[0].body.destinations[1].enabled, false);
  assert.equal(h.calls[0].body.enabled, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.field('推送目标2开关').props.checked, true);
});

test('发布时间与监控发现时间分别展示，旧记录只标首次保存而不伪造发现时间', () => {
  const Times = component().PostTimes;
  const html = renderToStaticMarkup(React.createElement(Times, { publishedAt: 1000, detectedAt: 2000, savedAt: 3000 }));
  assert.match(html, /博主发布：/); assert.match(html, /监控发现：/); assert.match(html, /北京时间/);
  const legacy = renderToStaticMarkup(React.createElement(Times, { publishedAt: 1000, savedAt: 3000 }));
  assert.match(legacy, /首次保存：/); assert.match(legacy, /旧记录/); assert.doesNotMatch(legacy, /监控发现：/);
});
