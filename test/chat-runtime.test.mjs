import test from 'node:test';
import assert from 'node:assert/strict';
import { hostAgentRuntime, ProgressGuard } from '../lib/chat-runtime.js';

const selection = { provider: 'fixture', model: 'fixture' };
function host(t) {
  const created = [], resumed = [], bindings = [], definitions = new Map(), listeners = new Map();
  const events = (name, ...args) => listeners.get(name)?.(...args);
  const scope = { tools: { restrict: value => bindings.push(value), register: (tool, options) => definitions.set(tool.name, { tool, options }) },
    systemPrompt: { section: value => bindings.push(value) }, on: (name, callback) => listeners.set(name, callback) };
  let work = Promise.resolve(), count = 0, disposed = 0, cancelled = 0, script;
  const agent = { model: { select() {} }, cancel() { cancelled++; },
    followup(message) { work = Promise.resolve().then(async () => {
      count++;
      events('agent/assistant-stream', { frame: { type: 'start', step: count } });
      await script?.(message, definitions, count);
      events('agent/assistant-stream', { frame: { type: 'chunk', chunk: { type: 'text-delta', text: '原生回答' } } });
      events('session/event', {}, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '原生回答' }] }, usage: { inputTokens: 10 } } });
      events('session/event', {}, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    }); }, whenIdle: () => work };
  const make = async (options, list) => { list.push(options); options.setup(scope, agent); return { agent, dispose: async () => { disposed++; } }; };
  const services = { compaction: {}, agents: { create: options => make(options, created), resume: options => make(options, resumed) } };
  const runtime = hostAgentRuntime(key => services[key], { available: () => true, selection: () => selection });
  t.after(() => runtime.close());
  return { runtime, created, resumed, bindings, definitions, script: fn => { script = fn; }, disposed: () => disposed, cancelled: () => cancelled };
}
const tool = { name: 'get_monitor_scope', description: 'scope', parameters: { type: 'object', properties: {} } };
const options = extra => ({ sessionId: 'fixture-session', system: '规则', messages: [{ role: 'user', content: [{ type: 'text', text: '请求' }] }], tools: [tool], catalog: [tool], selection,
  signal: new AbortController().signal, onText() {}, onPhase() {}, onTool: async () => ({ ok: true }), ...extra });

test('宿主 Agent 真正持有会话循环，作用域工具屏蔽全局工具；问候后可使用业务工具', async t => {
  const h = host(t); let sessions = 0, calls = 0;
  await h.runtime.run(options({ tools: [], onSession: () => sessions++ }));
  assert.deepEqual(h.bindings[0], { allow: [] });
  assert.equal(h.created.length, 1); assert.equal(sessions, 1);
  assert.equal(h.definitions.get(tool.name).options.when(), false);
  h.script(async (_message, definitions) => { assert.equal(definitions.get(tool.name).options.when(), true); await definitions.get(tool.name).tool.execute({}, { signal: new AbortController().signal }); });
  const result = await h.runtime.run(options({ onTool: async () => { calls++; return { ok: true }; } }));
  assert.equal(result.text, '原生回答'); assert.equal(h.created.length, 1); assert.equal(calls, 1);
});

test('重启使用明确持久化标记恢复同一宿主会话，失败不静默新建', async t => {
  const h = host(t); await h.runtime.run(options({ resume: true }));
  assert.equal(h.resumed.length, 1); assert.equal(h.created.length, 0);
});

test('无 Agent 或压缩服务明确不可用，不退回简化循环', () => {
  const h = hostAgentRuntime(() => null, { available: () => true });
  assert.equal(h.available(), false); assert.throws(() => h.selection(), /未退回/);
});

test('新分页和新结果超过八次可以继续，同参数不同结果不算空转', () => {
  const guard = new ProgressGuard();
  for (let offset = 0; offset < 60; offset++) assert.equal(guard.observe('search_posts', { offset }, { ids: [offset] }), null);
  for (let i = 0; i < 20; i++) assert.equal(guard.observe('list_status', {}, { revision: i }), null);
});

test('同工具同参数同结果先提示改用其他范围，再停止；进展打破重复模式', () => {
  const guard = new ProgressGuard();
  for (let i = 0; i < 3; i++) assert.equal(guard.observe('search_posts', { offset: 0 }, { ids: [] }), null);
  assert.match(guard.observe('search_posts', { offset: 0 }, { ids: [] }), /没有新增材料/);
  assert.throws(() => guard.observe('search_posts', { offset: 0 }, { ids: [] }), /没有新进展/);
  assert.equal(guard.observe('search_posts', { offset: 20 }, { ids: [1] }), null);
});

test('写工具只返回确认预览，下步关闭工具；同批工具仍能提交多个对象', async t => {
  const h = host(t); let calls = 0;
  h.script(async (_message, definitions) => {
    const entry = definitions.get(tool.name);
    assert.equal(entry.options.when(), true);
    await entry.tool.execute({}, { signal: new AbortController().signal });
    assert.equal(entry.options.when(), false);
    await entry.tool.execute({}, { signal: new AbortController().signal });
  });
  await h.runtime.run(options({ onTool: async () => { calls++; return { pendingConfirmation: true }; } }));
  assert.equal(calls, 2);
});
