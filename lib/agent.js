import { deliveryDestinations, activeDestinations } from './delivery-config.js';
const defaults = { enabled: false, botId: '', targetId: '', uids: [] };
export const agentConfig = store => store.getSetting('agentDelivery', defaults);

export class SocialAgent {
  constructor(getStore, getIM, paused = () => false, summaryAvailable = () => false) {
    this.getStore = getStore;
    this.getIM = getIM;
    this.paused = paused;
    this.summaryAvailable = summaryAvailable;
    this.timer = null;
    this.startedAt = Date.now();
    this.connections = { bots: [], targets: {}, checkedAt: 0, error: '' };
    this.refreshing = null;
    this.busy = null;
    this.controller = new AbortController();
  }
  async refreshConnections() {
    if (this.refreshing) return this.refreshing;
    const im = this.getIM(), config = agentConfig(this.getStore());
    if (!im?.listBots || !im?.listTargets) return;
    this.refreshing = (async () => {
      try {
        const bots = (await im.listBots()).map(({ botId, channel }) => ({ botId, channel }));
        const targets = {};
        for (const botId of new Set(deliveryDestinations(config).map(item => item.botId))) {
          if (!bots.some(bot => bot.botId === botId)) continue;
          try { targets[botId] = (await im.listTargets(botId)).map(({ targetId, name }) => ({ targetId, name })); }
          catch { targets[botId] = null; }
        }
        this.connections = { bots, targets, checkedAt: Date.now(), error: '' };
      } catch { this.connections = { ...this.connections, checkedAt: Date.now(), error: '无法读取 dsh-im 配置，请检查插件' }; }
    })();
    try { await this.refreshing; } finally { this.refreshing = null; }
  }
  status() {
    const store = this.getStore(), config = agentConfig(store);
    const transportAvailable = ['send', 'listBots', 'listTargets'].every(key => typeof this.getIM()?.[key] === 'function');
    if (transportAvailable && Date.now() - this.connections.checkedAt > 30000) void this.refreshConnections();
    const destinations = deliveryDestinations(config).map(item => {
      const bot = this.connections.bots.find(bot => bot.botId === item.botId);
      const target = this.connections.targets[item.botId]?.find(target => target.targetId === item.targetId);
      const delivery = store.db.prepare("SELECT status,error,sent_at,finished_at,created_at FROM social_deliveries WHERE bot_id=? AND target_id=? AND status IN ('sent','failed','uncertain') ORDER BY COALESCE(finished_at,sent_at,created_at) DESC,id DESC LIMIT 1").get(item.botId, item.targetId);
      const test = store.getSetting('imTest:' + item.botId + ':' + item.targetId, null);
      const last = test && test.created_at > (delivery?.finished_at || delivery?.sent_at || delivery?.created_at || 0) ? test : delivery;
      const state = !transportAvailable ? 'unavailable' : !config.enabled || item.enabled === false ? 'paused'
        : !this.connections.checkedAt ? 'checking' : this.connections.error || !bot || !target ? 'invalid'
        : last && ['failed', 'uncertain'].includes(last.status) ? 'failed' : last?.status === 'sent' ? 'accepted' : 'configured';
      return { ...item, channel: bot?.channel || item.channel || '', name: target?.name || item.name || item.targetId, state, last };
    });
    return { config, transportAvailable, destinations, integration: this.connections, summaryAvailable: this.summaryAvailable(),
      deliveries: store.db.prepare('SELECT d.id,d.author,d.bot_id,d.target_id,d.status,d.error,d.created_at,d.sent_at,d.finished_at,p.published_at,p.detected_at,p.first_seen_at AS saved_at FROM social_deliveries d LEFT JOIN posts p ON p.id=d.post_id ORDER BY d.created_at DESC,d.id DESC LIMIT 30').all() };
  }
  async bots() {
    const im = this.getIM();
    if (typeof im?.listBots !== 'function') return [];
    return (await im.listBots()).map(({ botId, channel }) => ({ botId, channel }));
  }
  async targets(botId) {
    const im = this.getIM();
    if (typeof im?.listTargets !== 'function') throw new Error('尚未连接 dsh-im，请在 Harness 中启用 IM 机器人插件');
    return (await im.listTargets(botId)).map(({ targetId, name, kind }) => ({ targetId, name, kind }));
  }
  async validate(body, { force = false } = {}) {
    if (typeof body.enabled !== 'boolean' || !Array.isArray(body.uids) || body.uids.length > 2000 || body.uids.some(uid => typeof uid !== 'string' || !this.getStore().target(uid))) throw new Error('请选择有效的推送开关与博主');
    const multiple = Array.isArray(body.destinations);
    const input = multiple ? body.destinations : [{ botId: body.botId, targetId: body.targetId, enabled: true }];
    if (input.length > 20) throw new Error('最多配置 20 个推送目标');
    const destinations = [], keys = new Set(), current = agentConfig(this.getStore());
    let bots;
    for (const item of input) {
      if (typeof item.botId !== 'string' || typeof item.targetId !== 'string' || item.enabled !== undefined && typeof item.enabled !== 'boolean') throw new Error('请选择有效的机器人和接收目标');
      const value = { botId: item.botId.trim(), targetId: item.targetId.trim(), enabled: item.enabled !== false };
      if (value.botId.length > 256 || value.targetId.length > 256) throw new Error('机器人或目标标识格式无效，请从 dsh-im 选择');
      const previous = deliveryDestinations(current).find(row => row.botId === value.botId && row.targetId === value.targetId);
      if (previous?.channel) value.channel = previous.channel;
      if (previous?.name) value.name = previous.name;
      const key = value.botId + ':' + value.targetId;
      if (keys.has(key)) throw new Error('该接收目标已添加');
      keys.add(key);
      if (multiple && (!value.botId || !value.targetId)) throw new Error('请选择机器人和接收目标');
      if (body.enabled && value.enabled && (force || !current.enabled || !previous || previous.enabled === false)) {
        if (typeof this.getIM()?.send !== 'function') throw new Error('dsh-im 尚未连接，不能开启推送');
        bots ??= await this.bots();
        const bot = bots.find(bot => bot.botId === value.botId);
        const target = bot && (await this.targets(value.botId)).find(target => target.targetId === value.targetId);
        if (!target) throw new Error('请先在 dsh-im 保存机器人和接收目标，再刷新选择');
        value.channel = bot.channel; value.name = target.name || value.targetId;
      }
      destinations.push(value);
    }
    if (body.enabled && !destinations.some(item => item.enabled)) throw new Error('请至少开启一个接收目标');
    return multiple ? { enabled: body.enabled, uids: [...new Set(body.uids)], destinations }
      : { enabled: body.enabled, botId: destinations[0].botId, targetId: destinations[0].targetId, uids: [...new Set(body.uids)] };
  }
  async configure(body) {
    const value = await this.validate(body), store = this.getStore();
    const previous = agentConfig(store);
    store.transaction(() => {
      store.setSetting('agentDelivery', value);
      const destinations = deliveryDestinations(value);
      for (const item of activeDestinations(value)) {
        if (!activeDestinations(previous).some(old => old.botId === item.botId && old.targetId === item.targetId)) store.setSetting('deliveryFrom:' + item.botId + ':' + item.targetId, Date.now());
      }
      for (const row of store.db.prepare("SELECT id,bot_id,target_id FROM social_deliveries WHERE status='queued'").all()) {
        if (!destinations.some(item => item.botId === row.bot_id && item.targetId === row.target_id)) store.db.prepare("UPDATE social_deliveries SET status='cancelled',error='接收目标已移除' WHERE id=?").run(row.id);
      }
      for (const platform of ['weibo', 'xueqiu']) if (!Array.isArray(previous.destinations) && store.getSetting('accountAlerted:' + platform, false)) {
        for (const item of deliveryDestinations(previous)) store.setSetting('accountAlerted:' + platform + ':' + item.botId + ':' + item.targetId, true);
      }
      for (const platform of ['weibo', 'xueqiu']) for (const item of destinations) {
        if (!deliveryDestinations(previous).some(old => old.botId === item.botId && old.targetId === item.targetId)) store.setSetting('accountAlerted:' + platform + ':' + item.botId + ':' + item.targetId, false);
      }
      if (value.uids.length) for (const row of store.db.prepare("SELECT id,uid FROM social_deliveries WHERE status='queued' AND message=''").all()) if (!value.uids.includes(row.uid)) store.db.prepare("UPDATE social_deliveries SET status='cancelled',error='此博主已移出推送范围' WHERE id=?").run(row.id);
    })();
    for (const platform of ['weibo', 'xueqiu']) {
      const account = store.account(platform);
      if (value.enabled && account?.uid && ['needs_login', 'needs_verification'].includes(account.status)) store.setAccount({ status: account.status, reason: account.reason }, platform, true);
    }
    if (this.refreshing) await this.refreshing;
    this.connections.checkedAt = 0;
    await this.refreshConnections();
    return value;
  }
  async test(body) {
    const value = await this.validate({ enabled: true, botId: body.botId, targetId: body.targetId, uids: body.uids || [] }, { force: true });
    const store = this.getStore(), key = 'imTest:' + value.botId + ':' + value.targetId;
    try {
      const result = await this.getIM().send(value.botId, value.targetId, 'Social Trace 推送连接测试：这是一条由你主动发送的测试消息。', { signal: AbortSignal.timeout(15000) });
      if (result?.sent !== true) throw new Error('dsh-im 未确认接受测试消息');
      store.setSetting(key, { status: 'sent', error: '', created_at: Date.now(), sent_at: Date.now() });
      store.setSetting('imDeliveryAlert:' + value.botId + ':' + value.targetId, false);
      return { sent: true };
    } catch (error) {
      store.setSetting(key, { status: 'uncertain', error: String(error.message || '发送未确认').slice(0, 300), created_at: Date.now() });
      throw error;
    }
  }

  start() {
    if (this.timer) return;
    this.controller = new AbortController();
    this.startedAt = Date.now();
    const store = this.getStore(), config = agentConfig(store);
    const pending = activeDestinations(config).reduce((total, item) => total + store.db.prepare("SELECT COUNT(*) AS n FROM social_deliveries WHERE status='queued' AND message='' AND bot_id=? AND target_id=? AND created_at<?").get(item.botId, item.targetId, this.startedAt).n, 0);
    if (pending) store.notice('task', '恢复推送：上次运行时已保存的 ' + pending + ' 条动态尚未发送，将继续推送；这不是刚发布的新消息。');
    for (const platform of ['weibo', 'xueqiu']) {
      const account = this.getStore().account(platform);
      if (account?.uid && ['needs_login', 'needs_verification'].includes(account.status)) this.getStore().setAccount({ status: account.status, reason: account.reason }, platform, true);
    }
    this.getStore().db.prepare("UPDATE social_deliveries SET status='uncertain',finished_at=?,error='上次投递时进程中断，结果未知；未自动重发' WHERE status='sending'").run(Date.now());
    this.timer = setInterval(() => { void this.tick(); }, 5000);
    this.timer.unref?.();
  }
  async tick() {
    if (this.busy || this.paused() || this.controller.signal.aborted) return;
    const store = this.getStore(), config = agentConfig(store), im = this.getIM();
    if (!config.enabled || !im?.send) return;
    const destinations = activeDestinations(config);
    if (!destinations.length) return;
    const where = destinations.map(() => '(bot_id=? AND target_id=?)').join(' OR ');
    const row = store.db.prepare("SELECT * FROM social_deliveries WHERE status='queued' AND (" + where + ") AND (? OR message<>'') ORDER BY (message<>'') DESC,created_at,id LIMIT 1").get(...destinations.flatMap(item => [item.botId, item.targetId]), store.getSetting('monitorEnabled', true) === false ? 0 : 1);
    if (!row) return;
    const post = row.message ? null : store.posts({ ids: [row.post_id], limit: 1 })[0];
    if (!post && !row.message) { store.db.prepare("UPDATE social_deliveries SET status='cancelled',error='原文不存在' WHERE id=?").run(row.id); return; }
    store.db.prepare("UPDATE social_deliveries SET status='sending' WHERE id=?").run(row.id);
    this.busy = (async () => {
      try {
        const stamp = time => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        const prefix = post?.capture_kind === 'catchup' ? '离线补查通知：恢复运行后补查到的内容，并非刚刚发布。\n' : row.created_at < this.startedAt ? '恢复待发通知：上次运行时已保存，本次继续发送。\n' : '';
        const text = row.message || prefix + `${post.author} · ${post.quote ? '转发' : '新动态'}\n博主发布：${stamp(post.published_at)}\n监控发现：${post.detected_at ? stamp(post.detected_at) : '旧记录未记录'}\n首次保存：${stamp(post.first_seen_at)}\n发起推送：${stamp(Date.now())}（以上均为北京时间）\n\n${post.text.slice(0, 1400)}${post.quote ? '\n\n引用 ' + post.quote.author + '：' + post.quote.text.slice(0, 400) : ''}\n\n原文：${post.url}`;
        const result = await im.send(row.bot_id, row.target_id, text, { signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]) });
        if (result?.sent !== true) throw new Error('dsh-im 未确认接受消息');
        store.setSetting('imDeliveryAlert:' + row.bot_id + ':' + row.target_id, false);
        const finishedAt = Date.now();
        store.db.prepare("UPDATE social_deliveries SET status='sent',sent_at=?,finished_at=?,error='' WHERE id=?").run(finishedAt, finishedAt, row.id);
      } catch (error) {
        const status = ['unknown-bot', 'unknown-target', 'invalid-target', 'target-rejected', 'bot-not-connected'].includes(error.code) ? 'failed' : 'uncertain';
        store.db.prepare('UPDATE social_deliveries SET status=?,finished_at=?,error=? WHERE id=?').run(status, Date.now(), String(error.message || '投递失败').slice(0, 300), row.id);
        const alertKey = 'imDeliveryAlert:' + row.bot_id + ':' + row.target_id;
        if (!store.getSetting(alertKey, false)) {
          const destination = deliveryDestinations(config).find(item => item.botId === row.bot_id && item.targetId === row.target_id);
          const channel = destination?.channel || this.connections.bots.find(bot => bot.botId === row.bot_id)?.channel || 'IM';
          const recipient = '\n接收渠道：' + ({ weixin: '微信', qq: 'QQ' }[channel] || channel) + ' · ' + (destination?.name || row.target_id);
          store.notice('attention', error.code === 'delivery-failed' || error.message === 'delivery-failed'
            ? 'dsh-im 插件发送失败：请检查 dsh-im 的机器人连接和接收目标。消息已保存在本地，未确认是否送达；详见推送记录。' + recipient
            : 'dsh-im 推送未确认：请检查机器人连接与接收目标，详见推送记录。消息已保存在本地。' + recipient, Date.now());
          store.setSetting(alertKey, true);
        }
      }
    })();
    try { await this.busy; } finally { this.busy = null; }
  }
  async close() {
    clearInterval(this.timer); this.timer = null;
    this.controller.abort();
    if (this.busy) await this.busy;
  }
}
