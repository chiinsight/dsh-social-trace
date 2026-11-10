import { randomUUID } from 'node:crypto';
import { assembleContext, budgets } from './chat-context.js';
import { authorIndex } from './author-index.js';

const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(label + '格式无效');
  return value.trim();
};
const strings = (value, max = 20) => {
  if (!Array.isArray(value) || !value.length || value.length > max || value.some(item => typeof item !== 'string' || item.length > 100)) throw new Error('请选择有效的对象');
  return [...new Set(value)];
};
const objectSchema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' }, boolean = { type: 'boolean' }, uids = { type: 'array', items: string, minItems: 1, maxItems: 20 };
export const tools = [
  { name: 'list_status', description: '查询博主真实 ID、平台、监控状态、检查频率及总结任务。先查 ID，不猜昵称对应关系。', parameters: objectSchema({}) },
  { name: 'search_posts', description: '按博主查本地完整消息。from/to 是北京时间日期 YYYY-MM-DD（含结束日）；省略日期查询全部历史。返回有限摘录，完整内容使用 read_posts。', parameters: objectSchema({ uids, from: string, to: string, query: string, kind: { enum: ['all', 'original', 'repost'] }, offset: { type: 'integer', minimum: 0, maximum: 1000 } }, ['uids']) },
  { name: 'read_posts', description: '读取指定帖子正文和转发原文，保留来源编号；长内容会明确注明截断。', parameters: objectSchema({ ids: { type: 'array', items: string, minItems: 1, maxItems: 8 } }, ['ids']) },
  { name: 'read_author_index', description: '读取一个博主的本地资料数量、原创/转发、完整性和日期分布。仅用于导航和覆盖判断，不是观点证据；分析观点须继续读取原文。', parameters: objectSchema({ uid: string }, ['uid']) },
  { name: 'add_monitor', description: '创建从现在开始记录的博主监控。不会打开浏览器或开启历史缓存，需要用户在界面确认。', parameters: objectSchema({ platform: { enum: ['weibo', 'xueqiu'] }, url: string }, ['platform', 'url']) },
  { name: 'control_monitor', description: '开启或暂停指定博主的新动态或历史缓存；不改变另一类任务，不解除账号或平台冷却，需要确认。', parameters: objectSchema({ uid: string, kind: { enum: ['updates', 'history'] }, enabled: boolean }, ['uid', 'kind', 'enabled']) },
  { name: 'set_frequency', description: '为一个博主设置固定检查间隔（分钟），替换其分时规则，其他博主不变，需要确认。', parameters: objectSchema({ uid: string, minutes: { type: 'integer', minimum: 1, maximum: 10080 } }, ['uid', 'minutes']) },
  { name: 'create_summary_task', description: '创建能实际执行的本地总结任务，多个北京时间 HH:MM；默认工作日。每次总结当天本地消息，不是增量简报。首版只保存结果，不向 IM 自动发送。需要确认。', parameters: objectSchema({ name: string, uids, times: { type: 'array', items: string, minItems: 1, maxItems: 8 }, repeat: { enum: ['weekdays', 'daily'] }, instructions: string }, ['name', 'uids', 'times']) },
  { name: 'control_summary_task', description: '暂停或恢复已有总结任务，需确认。', parameters: objectSchema({ id: string, enabled: boolean }, ['id', 'enabled']) },
  { name: 'run_summary_task', description: '立即执行一次已有总结任务，仅保存本地报告，不改变原任务的定时开关或下一次时间，需要确认。', parameters: objectSchema({ id: string }, ['id']) },
];
const reads = new Set(['list_status', 'search_posts', 'read_posts', 'read_author_index']);
const writes = new Set(tools.filter(tool => !reads.has(tool.name)).map(tool => tool.name));
const schemaMap = new Map(tools.map(tool => [tool.name, tool.parameters]));
const dateAt = (value, end = false) => {
  if (value === undefined) return end ? Infinity : 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('日期无效，请使用 YYYY-MM-DD');
  return Date.parse(value + 'T00:00:00+08:00') + (end ? 86400000 : 0);
};
export function nextTaskAt(task, after) {
  const day = Math.floor((after + 28800000) / 86400000) * 86400000 - 28800000;
  for (let i = 0; i < 8; i++) {
    const start = day + i * 86400000, weekday = new Date(start + 28800000).getUTCDay();
    if (task.repeat === 'weekdays' && (weekday === 0 || weekday === 6)) continue;
    const next = task.times.map(time => start + Number(time.slice(0, 2)) * 3600000 + Number(time.slice(3)) * 60000).filter(at => at > after).sort((a, b) => a - b)[0];
    if (next !== undefined) return next;
  }
  throw new Error('执行时间无效');
}

export class BusinessChat {
  constructor(getStore, business, model, { now = Date.now, paused = () => false } = {}) {
    this.getStore = getStore; this.business = business; this.model = model; this.now = now;
    this.busy = null; this.controller = null; this.timer = null; this.closed = false; this.paused = paused;
    const db = getStore().db;
    db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_runs (id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES chat_sessions(id),input TEXT NOT NULL,status TEXT NOT NULL,answer TEXT NOT NULL DEFAULT '',steps TEXT NOT NULL DEFAULT '[]',sources TEXT NOT NULL DEFAULT '[]',action TEXT,created_at INTEGER NOT NULL,finished_at INTEGER);
      CREATE INDEX IF NOT EXISTS chat_session_runs ON chat_runs(session_id,created_at);
      CREATE TABLE IF NOT EXISTS chat_tasks (id TEXT PRIMARY KEY,name TEXT NOT NULL,uids TEXT NOT NULL,times TEXT NOT NULL,repeat TEXT NOT NULL,instructions TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,next_run_at INTEGER NOT NULL,last_run_id TEXT,created_at INTEGER NOT NULL);`);
    for (const [table, column, definition] of [['chat_sessions', 'deleted_at', 'INTEGER'], ['chat_runs', 'error', "TEXT NOT NULL DEFAULT ''"], ['chat_runs', 'context', "TEXT NOT NULL DEFAULT '{}'"]]) {
      if (!db.prepare('PRAGMA table_info(' + table + ')').all().some(row => row.name === column)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
    }
  }
  async deleteSession(id) {
    if (typeof id !== 'string' || !this.store.db.prepare('SELECT id FROM chat_sessions WHERE id=? AND deleted_at IS NULL').get(id)) throw new Error('对话不存在或已删除');
    if (this.busy?.sessionId === id) { this.controller.abort(); await this.work; }
    this.store.db.prepare('UPDATE chat_sessions SET deleted_at=? WHERE id=?').run(this.now(), id);
    return { ok: true, id };
  }
  restoreSession(id) {
    if (typeof id !== 'string' || !this.store.db.prepare('SELECT id FROM chat_sessions WHERE id=? AND deleted_at IS NOT NULL').get(id)) throw new Error('对话不存在或无需恢复');
    this.store.db.prepare('UPDATE chat_sessions SET deleted_at=NULL WHERE id=?').run(id);
    return { ok: true, id };
  }
  recover() {
    this.store.db.prepare("UPDATE chat_runs SET status='interrupted',finished_at=?,answer='上次执行中断，已完成的业务操作保留；请查看步骤记录后重试' WHERE status IN ('running','executing')").run(this.now());
  }
  get store() { return this.getStore(); }
  sessions() { return this.store.db.prepare('SELECT s.*,COALESCE(MAX(r.created_at),s.created_at) AS updated_at FROM chat_sessions s LEFT JOIN chat_runs r ON r.session_id=s.id WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY updated_at DESC,s.rowid DESC LIMIT 50').all(); }
  runs(sessionId) {
    return this.store.db.prepare('SELECT * FROM (SELECT *,rowid AS position FROM chat_runs WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20) ORDER BY created_at,position').all(sessionId)
      .map(row => ({ ...row, context: JSON.parse(row.context), steps: JSON.parse(row.steps), sources: JSON.parse(row.sources), action: row.action ? JSON.parse(row.action) : null }));
  }
  tasks() { return this.store.db.prepare('SELECT * FROM chat_tasks ORDER BY created_at DESC LIMIT 100').all().map(row => ({ ...row, enabled: !!row.enabled, uids: JSON.parse(row.uids), times: JSON.parse(row.times) })); }
  view(sessionId) {
    const runs = sessionId && this.store.db.prepare('SELECT id FROM chat_sessions WHERE id=? AND deleted_at IS NULL').get(sessionId) ? this.runs(sessionId).map(run => ({ ...run,
      sources: run.sources.map(({ sourceId, id, uid, author, publishedAt, url, truncated }) => ({ sourceId, id, uid, author, publishedAt, url, truncated })),
      steps: run.steps.map(step => ({ ...step, result: step.result ? { error: step.result.error, total: step.result.total, count: step.result.items?.length } : undefined })),
    })) : [];
    return { available: this.model.available(), sessions: this.sessions(), runs, tasks: this.tasks(), busy: this.busy?.id || null };
  }
  patch(id, patch) {
    const allowed = ['status', 'answer', 'steps', 'sources', 'action', 'finished_at', 'error', 'context'];
    const entries = Object.entries(patch);
    if (entries.some(([key]) => !allowed.includes(key))) throw new Error('无效运行状态');
    this.store.db.prepare('UPDATE chat_runs SET ' + entries.map(([key]) => key + '=?').join(',') + ' WHERE id=?')
      .run(...entries.map(([key, value]) => ['steps', 'sources', 'action', 'context'].includes(key) && value !== null ? JSON.stringify(value) : value), id);
  }
  newSession(title) {
    const id = randomUUID(); this.store.db.prepare('INSERT INTO chat_sessions(id,title,created_at) VALUES(?,?,?)').run(id, title.slice(0, 40), this.now()); return id;
  }
  start(input, sessionId = '', task = null) {
    if (this.closed || this.busy || this.paused()) throw new Error('后台忙碌，请等待或停止当前任务');
    input = text(input, 4000, '消息');
    if (sessionId && !this.store.db.prepare('SELECT id FROM chat_sessions WHERE id=? AND deleted_at IS NULL').get(sessionId)) throw new Error('对话不存在');
    const selection = this.model.selection();
    sessionId ||= this.newSession(task?.name || input);
    const id = randomUUID(), controller = new AbortController();
    this.store.db.prepare("INSERT INTO chat_runs(id,session_id,input,status,created_at) VALUES(?,?,?,'running',?)").run(id, sessionId, input, this.now());
    this.controller = controller;
    this.busy = { id, sessionId, taskId: task?.id || null };
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
    const aborted = new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('执行已停止或超时，未完成的操作不会继续执行')), { once: true }));
    this.work = Promise.race([this.execute(id, sessionId, input, selection, signal, task), aborted])
      .catch(error => this.patch(id, { status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message, finished_at: this.now() }))
      .finally(() => { this.busy = null; this.controller = null; });
    return { id, sessionId };
  }
  cancel(id) {
    if (this.busy?.id === id) this.controller.abort();
    else {
      const run = this.store.db.prepare('SELECT status FROM chat_runs WHERE id=?').get(id);
      if (run?.status !== 'awaiting_confirmation') throw new Error('该操作已结束');
      this.patch(id, { status: 'cancelled', action: null, answer: '已取消，未修改配置', finished_at: this.now() });
    }
  }
  validate(name, args) {
    const schema = schemaMap.get(name);
    if (!schema || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => !Object.hasOwn(args, key))) throw new Error('工具参数不完整或包含不允许的字段');
    for (const [key, value] of Object.entries(args)) {
      const field = schema.properties[key];
      if (field.enum && !field.enum.includes(value) || field.type === 'string' && typeof value !== 'string' || field.type === 'boolean' && typeof value !== 'boolean'
        || field.type === 'integer' && (!Number.isInteger(value) || value < field.minimum || value > field.maximum)) throw new Error('工具参数格式无效：' + key);
    }
  }
  targets(ids) {
    return strings(ids).map(uid => { const target = this.store.target(uid); if (!target) throw new Error('博主不存在，请先查询准确 ID'); return target; });
  }
  async execute(id, sessionId, input, selection, signal, task) {
    const steps = [], references = new Map(); let size = 0, count = 0, readThisTurn = false;
    const history = this.runs(sessionId).filter(run => run.id !== id && run.status === 'completed').slice(-budgets.historyRuns);
    let number = 0;
    for (const run of history) for (const source of run.sources) if (this.store.target(source.uid)) {
      references.set(source.id, source); number = Math.max(number, Number(source.sourceId.slice(1)) || 0);
    }
    const greeting = /^(?:你好|您好|嗨|hello|hi|早上好|晚上好)[\s！!，,。.？?]*$/i.test(input.trim());
    const availableTools = greeting && !task ? [] : task ? tools.filter(tool => reads.has(tool.name)) : tools;
    const allowedTools = new Set(availableTools.map(tool => tool.name));
    const { system, messages, workingContext } = assembleContext({ input, history, task, now: this.now(), tools: availableTools, selection });
    this.patch(id, { context: workingContext });
    const sourceFor = (post, full) => {
      if (task && !task.uids.includes(post.uid)) throw new Error('该博主不在任务范围内');
      if (task && (post.published_at < dateAt(workingContext.dateScope.from) || post.published_at >= dateAt(workingContext.dateScope.to, true))) throw new Error('该消息不在本次总结日期内');
      const old = references.get(post.id);
      const source = { sourceId: old?.sourceId || 'S' + (++number), id: post.id, uid: post.uid, author: post.author, publishedAt: post.published_at,
        article: post.article === true,
        detectedAt: post.detected_at, firstSavedAt: post.first_seen_at, url: post.url, excerpt: post.text.slice(0, full ? 12000 : 800),
        quote: post.quote ? { author: post.quote.author, text: post.quote.text.slice(0, full ? 6000 : 500), article: post.quote.article === true } : null,
        truncated: post.text.length > (full ? 12000 : 800) || !!post.quote && post.quote.text.length > (full ? 6000 : 500) };
      references.set(post.id, source); return source;
    };
    for (let round = 0; round < budgets.rounds; round++) {
      signal.throwIfAborted();
      const step = { kind: 'model', round: round + 1, model: selection.model, status: 'running', phase: 'requesting', startedAt: this.now() };
      steps.push(step);
      this.patch(id, { answer: '', steps });
      let streamed = '', last = 0;
      const response = await this.model.generate({ system, messages, tools: availableTools, selection, signal, onPhase: phase => {
        signal.throwIfAborted();
        if (['thinking', 'answering', 'preparing_tools'].includes(phase)) { step.phase = phase; this.patch(id, { steps }); }
      }, onText: delta => {
        streamed += delta; signal.throwIfAborted();
        if (streamed.length > 18000) throw new Error('回答超过长度限制，请缩小问题范围');
        if (this.now() - last > 250) { this.patch(id, { answer: streamed }); last = this.now(); }
      } });
      signal.throwIfAborted();
      Object.assign(step, { status: 'completed', finishedAt: this.now(), usage: response.usage || null });
      if (!response.calls.length) {
        const answer = text(response.text, 18000, '模型回答');
        const cited = [...answer.matchAll(/\[S(\d+)\]/g)].map(match => match[0].slice(1, -1));
        if (cited.some(sourceId => ![...references.values()].some(source => source.sourceId === sourceId)) || readThisTurn && !cited.length) {
          steps.push({ kind: 'validation', name: 'validate_sources', status: 'failed', finishedAt: this.now() });
          this.patch(id, { answer, steps, sources: [...references.values()] });
          throw new Error('来源核对未通过：部分引用不存在或未标注，以上内容尚不能作为已核实结论');
        }
        this.patch(id, { status: 'completed', answer, steps, sources: [...references.values()].filter(source => cited.includes(source.sourceId)), finished_at: this.now() });
        return;
      }
      messages.push({ id: randomUUID(), role: 'assistant', source: response.source, content: response.content });
      const pendingActions = []; let failedCall = false;
      for (const call of response.calls) {
        signal.throwIfAborted();
        if (++count > budgets.toolCalls) throw new Error('工具调用达到上限，请缩小问题范围');
        const toolStep = { kind: 'tool', name: call.name, status: 'running', startedAt: this.now() };
        steps.push(toolStep); this.patch(id, { steps });
        let result, failed = false;
        try {
          if (!allowedTools.has(call.name)) throw new Error('本次执行未开放该工具');
          const args = JSON.parse(call.arguments); this.validate(call.name, args);
          if (task && writes.has(call.name)) throw new Error('定时任务不能修改监控配置');
          if (writes.has(call.name)) {
            this.checkWrite(call.name, args);
            const action = { name: call.name, args, label: this.actionLabel(call.name, args) };
            Object.assign(toolStep, { status: 'awaiting_confirmation', actionIndex: pendingActions.length, finishedAt: this.now() });
            pendingActions.push(action);
            continue;
          }
          if (call.name === 'list_status') {
            result = { targets: this.store.targets().filter(target => !task || task.uids.includes(target.uid)).slice(0, 200).map(target => ({ uid: target.uid, name: target.name, platform: target.platform,
              enabled: this.store.monitoringEnabled(target.platform, target.uid), accountStatus: this.store.account(target.platform).status,
              policy: this.store.monitoringPolicy(target), jobs: this.store.jobs().filter(job => job.uid === target.uid).map(job => ({ id: job.id, kind: job.kind, status: job.status, lastCheckedAt: job.last_success_at })) })), tasks: task ? [] : this.tasks() };
          } else if (call.name === 'read_author_index') {
            this.targets([args.uid]);
            if (task && !task.uids.includes(args.uid)) throw new Error('不能读取任务范围之外的博主');
            result = authorIndex(this.store, args.uid, this.now());
          } else if (call.name === 'search_posts') {
            const targets = this.targets(args.uids);
            const from = Math.max(dateAt(args.from), task ? dateAt(workingContext.dateScope.from) : 0);
            const to = Math.min(dateAt(args.to, true), task ? dateAt(workingContext.dateScope.to, true) : Infinity);
            if (task && targets.some(target => !task.uids.includes(target.uid))) throw new Error('不能读取任务范围之外的博主');
            if (from >= to || args.query !== undefined && (typeof args.query !== 'string' || args.query.length > 200)) throw new Error('时间范围或关键词无效');
            const where = ['complete=1', 'uid IN (' + targets.map(() => '?').join(',') + ')', 'published_at>=?', 'published_at<?'];
            const values = [...targets.map(target => target.uid), from, Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER];
            if (args.query) { where.push('(instr(text,?)>0 OR instr(COALESCE(quote,\'\'),?)>0)'); values.push(args.query, args.query); }
            if (args.kind === 'original') where.push('quote IS NULL');
            if (args.kind === 'repost') where.push('quote IS NOT NULL');
            const sql = where.join(' AND '), total = this.store.db.prepare('SELECT COUNT(*) AS n FROM posts WHERE ' + sql).get(...values).n;
            const ids = this.store.db.prepare('SELECT id FROM posts WHERE ' + sql + ' ORDER BY published_at DESC,id DESC LIMIT 20 OFFSET ?').all(...values, args.offset || 0).map(row => row.id);
            result = { total, offset: args.offset || 0, items: this.store.posts({ ids, limit: 20 }).map(post => sourceFor(post, false)), note: '仅查询本地完整资料；总数超过本页时不能声称已覆盖全部' };
            if (result.items.length) readThisTurn = true;
          } else if (call.name === 'read_posts') {
            const ids = strings(args.ids, 8), posts = this.store.posts({ ids, limit: 8 });
            if (posts.length !== ids.length || posts.some(post => !post.complete)) throw new Error('部分原文不存在或未保存完整');
            result = { items: posts.map(post => sourceFor(post, true)) };
            readThisTurn = true;
          } else throw new Error('工具不存在');
        } catch (error) { result = { error: error.message }; failed = true; failedCall = true; }
        const encoded = JSON.stringify(result); size += encoded.length;
        if (size > budgets.toolResultChars) throw new Error('本次资料超出上下文预算，请分博主或缩小时间范围后重试；未标记资料已处理');
        Object.assign(toolStep, { status: failed ? 'failed' : 'completed', result, finishedAt: this.now() });
        this.patch(id, { steps, sources: [...references.values()] });
        messages.push({ id: randomUUID(), role: 'tool', source: { kind: 'tool', callId: call.id }, toolCallId: call.id, isError: failed, content: [{ type: 'text', text: encoded }] });
      }
      if (pendingActions.length) {
        if (failedCall) {
          for (const step of steps.filter(step => step.status === 'awaiting_confirmation')) step.status = 'cancelled';
          this.patch(id, { steps });
          throw new Error('同批请求有项目校验失败，本批未执行；请检查处理步骤后重新提出请求');
        }
        const action = pendingActions.length === 1 ? pendingActions[0] : { name: 'batch', actions: pendingActions, label: `将执行以下 ${pendingActions.length} 项变更` };
        this.patch(id, { status: 'awaiting_confirmation', answer: '请确认以下变更，确认前不会修改配置。', steps, sources: [...references.values()], action });
        return;
      }
    }
    throw new Error('达到本次执行轮数上限，请缩小问题范围后重试');
  }
  checkWrite(name, args) {
    if (['control_monitor', 'set_frequency'].includes(name)) this.targets([args.uid]);
    if (name === 'control_monitor' && !['updates', 'history'].includes(args.kind)) throw new Error('请选择新动态或历史缓存');
    if (name === 'add_monitor') text(args.url, 300, '主页');
    if (name === 'create_summary_task') {
      text(args.name, 80, '任务名称'); this.targets(args.uids);
      const times = strings(args.times, 8);
      if (times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('执行时间需要 HH:MM');
      if (args.instructions !== undefined && (typeof args.instructions !== 'string' || args.instructions.length > 1000)) throw new Error('总结要求最多 1000 字');
    }
    if (['control_summary_task', 'run_summary_task'].includes(name) && !this.tasks().some(task => task.id === args.id)) throw new Error('总结任务不存在');
  }
  actionLabel(name, args) {
    const names = args.uid ? this.store.target(args.uid).name : args.uids ? this.targets(args.uids).map(target => target.name).join('、') : '';
    return name === 'control_monitor' ? `${names}：${args.enabled ? '开启' : '暂停'}${args.kind === 'updates' ? '新动态监控' : '历史缓存'}`
      : name === 'set_frequency' ? `${names}：改为固定每 ${args.minutes} 分钟检查，替换该博主的分时规则`
      : name === 'add_monitor' ? `添加${args.platform === 'weibo' ? '微博' : '雪球'}博主 ${args.url}，从现在开始监控`
      : name === 'create_summary_task' ? `创建总结任务「${args.name}」：${names}；${args.repeat === 'daily' ? '每天' : '工作日'} ${args.times.join('、')}（北京时间）；仅保存本地`
      : name === 'run_summary_task' ? `立即执行总结任务「${this.tasks().find(task => task.id === args.id)?.name}」，仅保存本地报告`
      : `${args.enabled ? '恢复' : '暂停'}总结任务「${this.tasks().find(task => task.id === args.id)?.name}」`;
  }
  confirm(id) {
    if (this.busy || this.closed || this.paused()) throw new Error('请等当前执行结束后再确认');
    const run = this.store.db.prepare('SELECT * FROM chat_runs WHERE id=?').get(id);
    if (!run || run.status !== 'awaiting_confirmation' || !run.action) throw new Error('该变更已处理或不存在，未重复执行');
    if (this.now() - run.created_at > 600000) throw new Error('变更预览已过期，请重新提出请求');
    if (!this.store.db.prepare('SELECT id FROM chat_sessions WHERE id=? AND deleted_at IS NULL').get(run.session_id)) throw new Error('该对话已删除，请先恢复对话再确认');
    const preview = JSON.parse(run.action), actions = preview.name === 'batch' ? preview.actions : [preview];
    if (!Array.isArray(actions) || !actions.length || actions.length > budgets.toolCalls) throw new Error('变更预览格式无效');
    for (const action of actions) {
      if (!writes.has(action.name)) throw new Error('变更工具无效');
      this.validate(action.name, action.args); this.checkWrite(action.name, action.args);
    }
    if (actions.length > 1 && actions.some(action => action.name === 'run_summary_task')) throw new Error('立即总结需要单独确认执行，请分别发起');
    this.patch(id, { status: 'executing' });
    const steps = JSON.parse(run.steps), results = [], receipts = [];
    const prefix = actions.length === 1 ? '已执行：' : '已执行：\n';
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      const pending = steps.find(step => step.kind === 'tool' && step.status === 'awaiting_confirmation' && (step.actionIndex === index || step.actionIndex === undefined && step.name === action.name));
      try {
        const result = this.executeAction(action);
        results.push(result); receipts.push(action.label + (result.note ? '\n' + result.note : ''));
        if (pending) pending.status = 'completed';
        steps.push({ kind: 'operation', name: action.name, label: action.label, status: 'completed', result });
        this.patch(id, { steps, answer: prefix + receipts.join('\n\n') });
      } catch (error) {
        if (pending) pending.status = 'failed';
        for (const step of steps.filter(step => step.status === 'awaiting_confirmation')) step.status = 'cancelled';
        steps.push({ kind: 'operation', name: action.name, label: action.label, status: 'failed', error: error.message });
        const remaining = actions.slice(index + 1).map(item => item.label);
        const answer = (receipts.length ? '已执行：\n' + receipts.join('\n\n') + '\n\n' : '')
          + '执行未完成：' + action.label + '：' + error.message
          + (remaining.length ? '\n尚未执行：\n' + remaining.join('\n') : '') + '\n未自动重试，请查看实际配置。';
        this.patch(id, { status: 'failed', answer, steps, action: null, finished_at: this.now() });
        throw new Error(answer);
      }
    }
    this.patch(id, { status: 'completed', answer: prefix + receipts.join('\n\n'), steps, action: null, finished_at: this.now() });
    return actions.length === 1 ? { result: results[0] } : { results };
  }
  executeAction(action) {
    const args = action.args;
    let result;
    if (action.name === 'add_monitor') result = this.business.add(args.platform, args.url);
    else if (action.name === 'control_monitor') {
      const job = this.store.jobs().find(job => job.uid === args.uid && job.kind === args.kind);
      if (!job) throw new Error('任务不存在');
      result = this.business.job(job.id, args.enabled ? 'resume' : 'pause', args.enabled);
    } else if (action.name === 'set_frequency') result = this.business.policy({ uid: args.uid, platform: this.store.target(args.uid).platform, inherit: false, intervalMinutes: args.minutes, schedule: { enabled: false, fallbackMinutes: args.minutes, windows: [] } });
    else if (action.name === 'create_summary_task') {
      if (this.tasks().length >= 100) throw new Error('总结任务数量已达上限');
      const task = { id: randomUUID(), name: args.name, uids: strings(args.uids), times: strings(args.times, 8).sort(), repeat: args.repeat || 'weekdays', instructions: args.instructions || '归纳关键观点，区分原创和转发，附原文来源' };
      this.store.db.prepare('INSERT INTO chat_tasks(id,name,uids,times,repeat,instructions,next_run_at,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(task.id, task.name, JSON.stringify(task.uids), JSON.stringify(task.times), task.repeat, task.instructions, nextTaskAt(task, this.now()), this.now());
      result = this.tasks().find(row => row.id === task.id);
    } else if (action.name === 'run_summary_task') {
      result = this.runTask(this.tasks().find(row => row.id === args.id), false);
    } else {
      const task = this.tasks().find(row => row.id === args.id);
      this.store.db.prepare('UPDATE chat_tasks SET enabled=?,next_run_at=? WHERE id=?').run(Number(args.enabled), nextTaskAt(task, this.now()), task.id);
      result = this.tasks().find(row => row.id === task.id);
    }
    return result;
  }
  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 15000); this.timer.unref();
  }
  tick() {
    if (this.busy || this.closed || this.paused() || !this.model.available()) return;
    const task = this.tasks().find(task => task.enabled && task.next_run_at <= this.now());
    if (!task) return;
    try {
      this.runTask(task, true);
    } catch { /* Missing model or current work leaves the due task available for the next tick. */ }
  }
  runTask(task, scheduled) {
    const today = new Date(this.now() + 28800000).toISOString().slice(0, 10);
    const result = this.start(`${scheduled ? '定时' : '立即'}总结「${task.name}」：${today}（北京时间）的本地资料`, '', task);
    this.store.db.prepare('UPDATE chat_tasks SET next_run_at=?,last_run_id=? WHERE id=?').run(scheduled ? nextTaskAt(task, this.now()) : task.next_run_at, result.id, task.id);
    return { runId: result.id, sessionId: result.sessionId, note: '已受理，报告生成中；完成结果请查看任务的最近报告' };
  }
  async close() { this.closed = true; clearInterval(this.timer); this.controller?.abort(); if (this.work) await this.work; }
}
