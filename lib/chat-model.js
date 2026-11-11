import { randomUUID } from 'node:crypto';

export const message = (role, text, selection = {}) => ({ id: randomUUID(), role, content: [{ type: 'text', text }],
  source: role === 'assistant' ? { kind: 'model', provider: selection.provider, model: selection.model } : { kind: 'user' } });

// The host owns credentials and routing. No browser or other session is inherited.
export function hostModel(getService) {
  const services = () => ({ llm: getService('llm'), defaults: getService('agentDefaultModel') });
  return {
    selection() {
      const { llm, defaults } = services();
      const selected = defaults?.currentSelection?.();
      if (!llm?.stream || !selected?.provider || !selected?.model) throw new Error('请先在 DSH 配置默认模型，并启用模型服务');
      return { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}) };
    },
    available() { try { this.selection(); return true; } catch { return false; } },
    async generate({ system, messages, tools, selection, signal, onText, onPhase }) {
      const { llm } = services();
      if (!llm?.stream) throw new Error('DSH 模型服务暂不可用');
      const blocks = new Map(); let finish, usage, replayState;
      const options = { ...selection, system, messages, tools, signal };
      const prepared = llm.prepareCall ? await llm.prepareCall({ ...selection }, signal) : null;
      const stream = prepared ? prepared.stream({ ...options, ...prepared.config }) : llm.stream(options);
      let phase;
      const report = next => { if (phase !== next) { phase = next; onPhase?.(next); } };
      for await (const chunk of stream) {
        signal.throwIfAborted();
        if (chunk.type === 'text-delta') {
          report('answering');
          const block = blocks.get(chunk.index) || { type: 'text', text: '' };
          block.text += chunk.text; blocks.set(chunk.index, block); onText?.(chunk.text);
        } else if (chunk.type === 'reasoning-delta') {
          report('thinking');
          // Kept only in the live provider conversation, never in UI or durable logs.
          const block = blocks.get(chunk.index) || { type: 'reasoning', text: '' };
          block.text += chunk.text; blocks.set(chunk.index, block);
        } else if (chunk.type === 'tool-call-delta') {
          report('preparing_tools');
          const block = blocks.get(chunk.index) || { type: 'tool-call', id: chunk.id, name: '', arguments: '' };
          if (chunk.name) block.name = chunk.name;
          block.arguments += chunk.argumentsDelta; blocks.set(chunk.index, block);
        } else if (chunk.type === 'block-end') blocks.set(chunk.index, chunk.block);
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'finish') { finish = chunk.reason; replayState = chunk.replayState; }
      }
      if (!finish || !['stop', 'tool-calls', 'max-tokens'].includes(finish.kind)) {
        const code = finish?.failure?.code;
        throw new Error(code ? '模型请求失败（' + String(code).slice(0, 60) + '），请检查 DSH 模型配置或稍后重试'
          : finish?.kind === 'max-tokens' ? '模型输出超出长度限制，请缩小问题范围后重试' : '模型响应未完整结束，未将本次回答标记为完成');
      }
      const content = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
      if (finish.kind === 'max-tokens' && content.some(block => block.type === 'tool-call')) throw new Error('模型的操作请求未生成完整，未执行任何配置修改');
      return { truncated: finish.kind === 'max-tokens', text: content.filter(block => block.type === 'text').map(block => block.text).join(''),
        calls: content.filter(block => block.type === 'tool-call'), content, usage,
        source: { kind: 'model', provider: selection.provider, model: selection.model, ...(replayState === undefined ? {} : { replayState }) } };
    },
  };
}
