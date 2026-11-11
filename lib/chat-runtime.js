import { randomUUID, createHash } from 'node:crypto';

// Business progress, independent of host model/compaction policy. Different pages
// or changing results continue; repeated identical observations get one warning.
export class ProgressGuard {
  constructor() { this.calls = []; this.warned = false; }
  observe(name, args, result) {
    const hash = createHash('sha256').update(JSON.stringify([name, args, result])).digest('hex');
    this.calls.push(hash); this.calls = this.calls.slice(-16);
    const consecutive = this.calls.length >= 4 && this.calls.slice(-4).every(value => value === hash);
    const rotation = this.calls.length >= 12 && new Set(this.calls.slice(-12)).size <= 2 || this.calls.length === 16 && new Set(this.calls).size <= 4;
    if (!consecutive && !rotation) { this.warned = false; return null; }
    if (this.warned) throw new Error('连续重复读取相同材料且没有新进展，已停止；已有结果保留，请明确下一步范围');
    this.warned = true;
    return '已重复读取相同结果，没有新增材料。请改用不同分页/范围，或根据已有证据回答，不要重复同一调用。';
  }
}

// All access is through public scoped DSH services. No imports from a user's
// installation directory and no inheritance of general shell/browser tools.
export function hostAgentRuntime(getService, model) {
  const handles = new Map();
  const registry = () => {
    const agents = getService('agents');
    if (!agents?.create || !agents?.resume || !getService('compaction')) throw new Error('DSH Agent 或自动压缩服务未就绪，请更新或启用宿主服务；未退回旧的简化执行循环');
    return agents;
  };
  return {
    selection: () => { registry(); return model.selection(); },
    available() { try { registry(); return model.available(); } catch { return false; } },
    info() { return { driver: 'dsh-agent', available: this.available(), compaction: !!getService('compaction') }; },
    async run({ sessionId, system, messages, tools, catalog = tools, selection, signal, resume = false, onSession, onTool, onText, onPhase, onModel }) {
      const agents = registry(), hostId = 'social-trace-' + sessionId;
      let entry = handles.get(hostId);
      const fresh = !entry && !resume;
      if (!entry) {
        entry = { binding: null, handle: null };
        const setup = (scope) => {
          scope.tools.restrict({ allow: [] });
          scope.systemPrompt.section({ name: 'social-trace.business', order: 0, complete: true, text: () => entry.binding.system });
          for (const tool of catalog) scope.tools.register({ ...tool,
            output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            isConcurrencySafe: () => false,
            execute: async (args, exec) => {
              exec.signal.throwIfAborted();
              if (!entry.binding.allowed.has(tool.name)) throw new Error('本次任务未开放该工具');
              try { const result = await entry.binding.onTool({ id: randomUUID(), name: tool.name, arguments: JSON.stringify(args) }); if (result.pendingConfirmation) entry.binding.pending = true; return result; }
              catch (error) { entry.binding.error = error; entry.handle.agent.cancel({ kind: 'user', reason: error.message }); throw error; }
            },
          }, { when: () => entry.binding.allowed.has(tool.name) && !entry.binding.pending });
          scope.on('agent/assistant-stream', ({ frame }) => {
            const b = entry.binding; if (!b || b.signal.aborted) return;
            if (frame.type === 'start') { b.currentText = ''; b.onModel?.('start'); }
            if (frame.type === 'chunk') {
              if (frame.chunk.type === 'text-delta') { b.currentText += frame.chunk.text; b.onText(b.prefix + b.currentText); b.onPhase('answering'); }
              if (frame.chunk.type === 'reasoning-delta') b.onPhase('thinking');
            }
          });
          scope.on('session/event', (_session, event) => {
            const b = entry.binding; if (!b) return;
            if (event.type === 'assistant/message') {
              b.answer = (event.data.message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
              b.onModel?.('end', event.data.usage);
            }
            if (event.type === 'turn/end') b.reason = event.data.reason;
          });
          scope.on('agent/error', ({ error }) => { if (entry.binding) entry.binding.error = error; });
        };
        entry.binding = { system, allowed: new Set(tools.map(tool => tool.name)), signal };
        // Resume only a known persisted identity; other resume failures must not
        // silently create another session or replay uncertain tool effects.
        entry.handle = resume ? await agents.resume({ sessionId: hostId, setup })
          : await agents.create({ sessionId: hostId, agentOptions: selection, setup });
        handles.set(hostId, entry); onSession?.();
      }
      const binding = { system, allowed: new Set(tools.map(tool => tool.name)), signal, onTool, onText, onPhase, onModel,
        answer: '', currentText: '', prefix: '', reason: null, error: null };
      entry.binding = binding;
      const agent = entry.handle.agent;
      agent.model?.select(selection);
      const abort = () => agent.cancel({ kind: 'user', reason: 'Social Trace 执行已取消' });
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        // Native sessions retain and compact their own history. Only the current
        // request is delivered again; old truncated chat answers are not replayed.
        const request = structuredClone(messages.at(-1));
        if (fresh && messages.length > 1) request.content.unshift({ type: 'text', text: '以下是迁移前的历史对话片段，仅作指代线索，状态和观点证据需要重新查询：\n' + JSON.stringify(messages.slice(0, -1)) });
        agent.followup(request);
        for (let continuation = 0; ; continuation++) {
          await agent.whenIdle(); signal.throwIfAborted();
          if (binding.error) throw binding.error;
          if (binding.reason?.kind === 'failed' || binding.reason?.kind === 'cancelled') throw new Error('DSH 执行未完成，请查看宿主运行状态');
          if (binding.reason?.kind !== 'max-tokens') return { text: binding.prefix + binding.answer, truncated: false };
          binding.prefix += binding.answer;
          if (continuation >= 2) return { text: binding.prefix, truncated: true };
          binding.allowed.clear(); binding.reason = null;
          agent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '从中断处继续，只补正文，不重复前文、不调用工具、不执行配置操作。' }] });
        }
      } finally { signal.removeEventListener('abort', abort); }
    },
    async close() { await Promise.all([...handles.values()].map(entry => entry.handle.dispose())); handles.clear(); },
  };
}
