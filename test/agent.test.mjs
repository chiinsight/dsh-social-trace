import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../lib/index.js';
import { normalizePost } from '../lib/platforms/weibo/index.js';

async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-agent-'));
  const sent = [];
  let available = true, fail = false;
  const im = { listBots: async () => [{ botId: 'bot-one', channel: 'feishu' }], listTargets: async () => [{ targetId: 'target-one', name: '测试目标' }, { targetId: 'target-two', name: '另一目标' }],
    send: async (...args) => { sent.push(args); if (fail) throw new Error('模拟网络中断'); return { sent: true }; } };
  const runtime = createRuntime(directory, { getIM: () => available ? im : null });
  const uid = '1234567890';
  runtime.store.addTarget(uid, '测试博主', Date.now() - 10000);
  runtime.store.addTarget('1234567891', '其他博主', Date.now() - 10000);
  const config = { enabled: true, botId: 'bot-one', targetId: 'target-one', uids: [uid] };
  const save = (id, kind = 'updates', author = uid, at = Date.now()) => runtime.store.savePost(normalizePost({ idstr: id, user: { idstr: author, screen_name: '测试博主' }, text: '新内容', created_at: new Date(at).toISOString() }, author), Date.now(), kind);
  const http = createServer(runtime.handle);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + http.address().port + '/dsh-social-trace';
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify(body) });
  t.after(async () => { http.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  return { runtime, base, post, config, sent, save, offline: () => { available = false; }, fail: () => { fail = true; } };
}

test('dsh-im 离线仍能单独暂停或移除目标，不改变另一个目标的开关', async t => {
  const h = await setup(t);
  const destinations = ['target-one', 'target-two'].map(targetId => ({ botId: 'bot-one', targetId, enabled: true }));
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations });
  h.offline();
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations: [destinations[0], { ...destinations[1], enabled: false }] });
  assert.equal(h.runtime.agent.status().config.destinations[0].enabled, true);
  assert.equal(h.runtime.agent.status().config.destinations[1].enabled, false);
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations: [destinations[0]] });
  assert.equal(h.runtime.agent.status().config.destinations.length, 1);
  await assert.rejects(h.runtime.agent.configure({ enabled: true, uids: [], destinations }), /连接|保存机器人/);
});

test('旧待发消息在测试成功之后发送失败，不能仍显示最近发送成功', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.save('10000000000000097');
  h.runtime.store.db.prepare('UPDATE social_deliveries SET created_at=?').run(Date.now() - 60000);
  await h.runtime.agent.test(h.config);
  assert.equal(h.runtime.agent.status().destinations[0].state, 'accepted');
  h.fail();
  await h.runtime.agent.tick();
  assert.equal(h.runtime.agent.status().destinations[0].state, 'failed');
});

test('历史抢先保存的新帖只通知一次，开启推送前的旧缓存不补发给新增目标', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  const from = h.runtime.store.getSetting('deliveryFrom:bot-one:target-one');
  const record = id => normalizePost({ idstr: id, user: { idstr: '1234567890', screen_name: '测试博主' }, text: '正文', created_at: new Date(from - 2).toISOString() }, '1234567890');
  h.runtime.store.savePost(record('10000000000000087'), from - 1, 'history');
  h.runtime.store.observeUpdate('10000000000000087', from + 1);
  assert.equal(h.runtime.agent.status().deliveries.length, 0, '推送开启前已经保存的历史内容不补发');
  h.runtime.store.savePost(record('10000000000000088'), from + 1, 'history');
  h.runtime.store.observeUpdate('10000000000000088', from + 2);
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations: ['target-one', 'target-two'].map(targetId => ({ botId: 'bot-one', targetId, enabled: true })) });
  h.runtime.store.observeUpdate('10000000000000088', from + 3);
  assert.equal(h.runtime.agent.status().deliveries.length, 1, '重复检查和添加新目标都不重放已观察的消息');
});

test('观察新动态和通知入队原子保存，入队失败后允许重新检查', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.save('10000000000000089', 'history');
  h.runtime.store.db.exec("CREATE TEMP TRIGGER fail_delivery BEFORE INSERT ON social_deliveries BEGIN SELECT RAISE(ABORT,'模拟写入失败'); END");
  assert.throws(() => h.runtime.store.observeUpdate('10000000000000089', Date.now()), /模拟写入失败/);
  assert.equal(h.runtime.store.db.prepare('SELECT update_observed_at FROM posts WHERE id=?').get('10000000000000089').update_observed_at, null);
  h.runtime.store.db.exec('DROP TRIGGER fail_delivery');
  h.runtime.store.observeUpdate('10000000000000089', Date.now());
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
});

test('多渠道同时入队和独立投递：一个失败不影响另一个，不重复入队', async t => {
  const h = await setup(t), sent = [];
  h.runtime.agent.getIM = () => ({
    listBots: async () => [{ botId: 'qq-bot', channel: 'qq' }, { botId: 'wx-bot', channel: 'weixin' }],
    listTargets: async bot => [{ targetId: bot + '-target', name: bot === 'qq-bot' ? 'QQ 私聊' : '微信私聊' }],
    send: async (bot, target) => { sent.push([bot, target]); if (bot === 'wx-bot') throw new Error('delivery-failed'); return { sent: true }; },
  });
  const destinations = [{ botId: 'wx-bot', targetId: 'wx-bot-target', enabled: true }, { botId: 'qq-bot', targetId: 'qq-bot-target', enabled: true }];
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations });
  h.save('10000000000000091'); h.save('10000000000000091');
  assert.equal(h.runtime.agent.status().deliveries.length, 2);
  await h.runtime.agent.tick(); await h.runtime.agent.tick();
  assert.equal(sent.length, 2);
  const status = h.runtime.agent.status();
  assert.equal(status.destinations.find(item => item.channel === 'qq').state, 'accepted');
  assert.equal(status.destinations.find(item => item.channel === 'weixin').state, 'failed');
  h.save('10000000000000092');
  assert.equal(h.runtime.agent.status().destinations.find(item => item.channel === 'weixin').state, 'failed', '新消息排队不能掩盖上次发送失败');
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations: [{ ...destinations[0], enabled: false }, destinations[1]] });
  await h.runtime.agent.tick();
  assert.equal(sent.at(-1)[0], 'qq-bot');
  assert.equal(h.runtime.agent.status().destinations.find(item => item.channel === 'weixin').state, 'paused');
  assert.equal(h.runtime.agent.status().deliveries.filter(item => item.status === 'queued').length, 1, '暂停保留此目标的待发记录');
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations: [destinations[1]] });
  assert.equal(h.runtime.agent.status().deliveries.filter(item => item.status === 'queued').length, 0, '移除目标取消对应待发记录');
});

test('连接异常按接收目标去重和恢复，多渠道配置校验不能覆盖原配置', async t => {
  const h = await setup(t);
  const destinations = ['target-one', 'target-two'].map(targetId => ({ botId: 'bot-one', targetId, enabled: true }));
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations });
  h.runtime.store.setAccount({ status: 'needs_login' }, 'weibo', true);
  h.runtime.store.setAccount({ status: 'needs_login' }, 'weibo', true);
  assert.equal(h.runtime.agent.status().deliveries.length, 2);
  h.runtime.store.setAccount({ status: 'ready' });
  h.runtime.store.setAccount({ status: 'needs_login' }, 'weibo', true);
  assert.equal(h.runtime.agent.status().deliveries.length, 4);
  await assert.rejects(h.runtime.agent.configure({ enabled: true, uids: [], destinations: [destinations[0], destinations[0]] }), /已添加/);
  assert.equal(h.runtime.agent.status().config.destinations.length, 2);
  await assert.rejects(h.runtime.agent.configure({ enabled: true, uids: [], destinations: [{ botId: 'unknown', targetId: 'unknown' }] }), /保存机器人/);
  h.offline();
  await h.runtime.agent.configure({ enabled: false, uids: [], destinations });
  assert.equal(h.runtime.agent.status().transportAvailable, false);
  await h.runtime.agent.tick();
  assert.equal(h.sent.length, 0);
});

test('旧配置升级不重复发授权提醒，新增目标单独提醒；测试成功更新对应渠道状态', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.runtime.store.setAccount({ uid: '8000000000', status: 'needs_login' });
  h.runtime.store.setSetting('accountAlerted:weibo', true);
  h.runtime.store.setAccount({ status: 'needs_login' }, 'weibo', true);
  assert.equal(h.runtime.agent.status().deliveries.length, 0);
  const destinations = ['target-one', 'target-two'].map(targetId => ({ botId: 'bot-one', targetId, enabled: true }));
  await h.runtime.agent.configure({ enabled: true, uids: [], destinations });
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  assert.equal(h.runtime.agent.status().deliveries[0].target_id, 'target-two');
  await h.runtime.agent.test({ botId: 'bot-one', targetId: 'target-one', uids: [] });
  assert.equal(h.runtime.agent.status().destinations.find(item => item.targetId === 'target-one').state, 'accepted');
});

test('补查与上次待发内容区别提醒，重启说明待发数量，不重发结果未知的记录', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.save('10000000000000081');
  const queued = h.runtime.agent.status().deliveries[0];
  h.runtime.store.db.prepare('UPDATE social_deliveries SET created_at=? WHERE id=?').run(Date.now() - 60000, queued.id);
  h.runtime.agent.start();
  assert.match(h.runtime.store.notices().find(n => /恢复推送/.test(n.message)).message, /1 条动态尚未发送/);
  await h.runtime.agent.tick();
  assert.match(h.sent[0][2], /^恢复待发通知/);
  h.save('10000000000000082', 'catchup');
  await h.runtime.agent.tick();
  assert.match(h.sent[1][2], /^离线补查通知/);
  assert.match(h.sent[1][2], /博主发布：[\s\S]*监控发现：[\s\S]*首次保存：/);
  await h.runtime.agent.tick();
  assert.equal(h.sent.length, 2);
});

test('dsh-im 通用失败直指对应插件，连续失败只提醒一次，投递记录逐条保留', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.runtime.agent.getIM = () => ({ send: async () => { throw Object.assign(new Error('delivery-failed'), { code: 'delivery-failed' }); } });
  h.save('10000000000000083'); h.save('10000000000000084');
  await h.runtime.agent.tick(); await h.runtime.agent.tick();
  assert.equal(h.runtime.agent.status().deliveries.filter(d => d.status === 'uncertain').length, 2);
  const alerts = () => h.runtime.store.notices().filter(n => n.kind === 'attention');
  assert.equal(alerts().length, 1);
  assert.match(alerts()[0].message, /dsh-im 插件发送失败.*检查 dsh-im/);
  h.runtime.agent.getIM = () => ({ send: async () => ({ sent: true }) });
  h.save('10000000000000085'); await h.runtime.agent.tick();
  h.runtime.agent.getIM = () => ({ send: async () => { throw new Error('delivery-failed'); } });
  h.save('10000000000000086'); await h.runtime.agent.tick();
  assert.equal(alerts().length, 2, '成功恢复后再发生失败，重新提醒');
});

test('推送默认关闭，未配置/离线只提示状态；保存不启动监控或模型', async t => {
  const h = await setup(t);
  h.save('10000000000000001');
  assert.equal(h.runtime.agent.status().config.enabled, false);
  assert.equal(h.runtime.agent.status().summaryAvailable, false);
  assert.equal(h.runtime.agent.status().deliveries.length, 0);
  h.offline();
  const bots = await (await fetch(h.base + '/agent/bots')).json();
  assert.equal(bots.available, false); assert.deepEqual(bots.items, []);
  assert.equal((await h.post('/agent/settings', h.config)).status, 400);
  assert.equal(h.sent.length, 0);
});

test('新内容与推送事件一并落盘，仅推送所选博主的增量，不补发旧文或历史缓存、不重复', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.save('10000000000000001');
  h.save('10000000000000001');
  h.save('10000000000000002', 'history');
  h.save('10000000000000003', 'updates', '1234567891');
  h.save('10000000000000004', 'updates', '1234567890', Date.now() - 1000000);
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  await h.runtime.agent.tick(); await h.runtime.agent.tick();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0][0], 'bot-one'); assert.equal(h.sent[0][1], 'target-one');
  assert.match(h.sent[0][2], /测试博主.*新动态/s); assert.match(h.sent[0][2], /原文：https:\/\/weibo.com/);
  assert.equal(h.runtime.agent.status().deliveries[0].status, 'sent');
  assert.throws(() => h.runtime.store.transaction(() => { h.save('10000000000000005'); throw new Error('回滚'); })());
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
});

test('关闭推送或采集总控不投递，变更接收目标取消旧目标的待发送内容', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config); h.save('10000000000000001');
  h.runtime.store.setSetting('monitorEnabled', false);
  await h.runtime.agent.tick(); assert.equal(h.sent.length, 0);
  h.runtime.store.setSetting('monitorEnabled', true);
  await h.runtime.agent.configure({ ...h.config, enabled: false });
  await h.runtime.agent.tick(); assert.equal(h.sent.length, 0);
  await h.runtime.agent.configure({ ...h.config, targetId: 'target-two' });
  await h.runtime.agent.tick(); assert.equal(h.sent.length, 0);
  assert.equal(h.runtime.agent.status().deliveries[0].status, 'cancelled');
  h.save('10000000000000002'); await h.runtime.agent.tick();
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0][1], 'target-two');
});

test('发送失败或重启时结果未知会保留记录，不自动重发，采集内容仍在', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config); h.save('10000000000000001'); h.fail();
  await h.runtime.agent.tick(); await h.runtime.agent.tick();
  assert.equal(h.sent.length, 1);
  assert.equal(h.runtime.agent.status().deliveries[0].status, 'uncertain');
  assert.equal(h.runtime.store.count(), 1);
  h.save('10000000000000002');
  h.runtime.store.db.prepare("UPDATE social_deliveries SET status='sending' WHERE status='queued'").run();
  h.runtime.agent.start();
  assert.ok(h.runtime.agent.status().deliveries.every(row => row.status === 'uncertain'));
  await h.runtime.agent.close();
});

test('HTTP 机器人/目标查询、保存与明确测试入口均通过共享 IM 服务，配置不改个人监控', async t => {
  const h = await setup(t);
  h.runtime.store.setSetting('targetPolicy:1234567890', { intervalMs: 420000 });
  assert.equal((await (await fetch(h.base + '/agent/bots')).json()).items[0].botId, 'bot-one');
  const targets = await (await fetch(h.base + '/agent/targets?botId=bot-one')).json();
  assert.equal(targets.items.length, 2);
  assert.equal(targets.items[0].route, undefined);
  assert.equal((await h.post('/agent/test', h.config)).status, 200);
  assert.equal(h.sent.length, 1); assert.match(h.sent[0][2], /主动发送的测试消息/);
  assert.equal(h.runtime.agent.status().config.enabled, false);
  assert.equal((await h.post('/agent/settings', h.config)).status, 200);
  assert.equal(h.runtime.store.monitoringPolicy(h.runtime.store.target('1234567890')).intervalMs, 420000);
  assert.equal((await h.post('/agent/settings', { ...h.config, uids: ['unknown'] })).status, 400);
  assert.equal((await h.post('/agent/settings', { ...h.config, targetId: 'unknown' })).status, 400);
  assert.equal(h.runtime.agent.status().config.targetId, 'target-one');
});

test('dsh-im 离线后仍能关闭已启用推送，不清空已有记录或重新发送', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config); h.save('10000000000000001');
  h.offline();
  assert.equal((await h.post('/agent/settings', { ...h.config, enabled: false })).status, 200);
  await h.runtime.agent.tick();
  assert.equal(h.runtime.agent.status().config.enabled, false);
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  assert.equal(h.sent.length, 0);
});

test('微博授权失效或要求验证通过 IM 提醒，同一次失效不重复；不受博主订阅和采集总控阻断', async t => {
  const h = await setup(t);
  await h.runtime.agent.configure(h.config);
  h.runtime.store.setAccount({ status: 'ready' });
  const job = h.runtime.store.jobs().find(job => job.kind === 'updates');
  h.runtime.worker.fail(job, { kind: 'login', message: '微博授权过期' });
  h.runtime.worker.fail(job, { kind: 'login', message: '微博授权过期' });
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  await h.runtime.agent.configure({ ...h.config, uids: ['1234567891'] });
  h.runtime.store.setSetting('monitorEnabled', false);
  await h.runtime.agent.tick();
  assert.equal(h.sent.length, 1); assert.match(h.sent[0][2], /微博登录授权已失效/);
  assert.match(h.sent[0][2], /连接与设置 → 微博/);
  await h.runtime.agent.tick(); assert.equal(h.sent.length, 1);
  h.runtime.store.setAccount({ status: 'ready' });
  h.runtime.worker.fail(job, { kind: 'verification', message: '需要验证' });
  await h.runtime.agent.tick();
  assert.equal(h.sent.length, 2); assert.match(h.sent[1][2], /微博要求验证/);
});

test('手动开始登录和推送关闭时不产生失效 IM；异常投递失败不循环制造新 IM', async t => {
  const h = await setup(t);
  h.runtime.store.setAccount({ status: 'ready' });
  h.runtime.store.setAccount({ status: 'needs_login', reason: '手动登录' }, 'weibo', true);
  assert.equal(h.runtime.agent.status().deliveries.length, 0);
  await h.runtime.agent.configure(h.config);
  h.runtime.store.setAccount({ status: 'ready' });
  h.runtime.store.setAccount({ status: 'needs_login', reason: '主动登录窗口' });
  assert.equal(h.runtime.agent.status().deliveries.length, 0);
  h.runtime.store.setAccount({ status: 'ready' });
  h.runtime.store.setAccount({ status: 'needs_login', reason: '失效' }, 'weibo', true);
  h.fail(); await h.runtime.agent.tick(); await h.runtime.agent.tick();
  assert.equal(h.sent.length, 1);
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  assert.equal(h.runtime.agent.status().deliveries[0].status, 'uncertain');
});

test('已有账号失效在启用推送或重启时补一条提醒；恢复后取消过期待发提醒', async t => {
  const h = await setup(t);
  h.runtime.store.setAccount({ uid: '8000000000', status: 'needs_login', reason: '此前已失效' });
  await h.runtime.agent.configure(h.config);
  h.runtime.agent.start(); await h.runtime.agent.close();
  h.runtime.agent.start(); await h.runtime.agent.close();
  assert.equal(h.runtime.agent.status().deliveries.length, 1);
  h.runtime.store.setAccount({ status: 'ready' });
  assert.equal(h.runtime.agent.status().deliveries[0].status, 'cancelled');
  h.runtime.agent.start(); await h.runtime.agent.tick(); await h.runtime.agent.close();
  assert.equal(h.sent.length, 0);
});

test('IM 原文明确区分发布、监控发现、首次保存、发起推送，回执保留原始时间', async t => {
  const activation = Date.now() - 10000;
  const clock = t.mock.method(Date, 'now', () => activation);
  const h = await setup(t); await h.runtime.agent.configure(h.config);
  clock.mock.restore();
  const now = Date.now(), published = now - 5000, detected = now - 3000, saved = now - 1000;
  const raw = { idstr: '10000000000000099', user: { idstr: '1234567890', screen_name: '测试博主' }, text: '时间验证', created_at: new Date(published).toISOString() };
  h.runtime.store.savePost(normalizePost(raw, '1234567890'), saved, 'updates', detected);
  await h.runtime.agent.tick();
  const format = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  assert.ok(h.sent[0][2].includes('博主发布：' + format(published)));
  assert.ok(h.sent[0][2].includes('监控发现：' + format(detected)));
  assert.ok(h.sent[0][2].includes('首次保存：' + format(saved)));
  assert.match(h.sent[0][2], /发起推送：.*北京时间/);
  const row = h.runtime.agent.status().deliveries[0];
  assert.equal(row.published_at, published); assert.equal(row.detected_at, detected); assert.equal(row.saved_at, saved);
  assert.ok(row.sent_at >= saved);
});
