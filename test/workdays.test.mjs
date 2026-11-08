import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.js';

test('旧版默认重复规则只迁移一次到工作日，保留明确的每天、个人频率、暂停及推送配置', () => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-workdays-'));
  let store;
  try {
    store = new Store(directory);
    const window = { start: '09:00', end: '15:00', intervalMinutes: 1 };
    const schedule = { enabled: true, fallbackMinutes: 60, windows: [window] };
    store.setSetting('schedule:weibo', schedule);
    store.setSetting('targetPolicy:author', { intervalMs: 123000, schedule: { ...schedule, windows: [{ ...window, repeat: 'daily' }] } });
    store.setSetting('monitorEnabled', false);
    store.setSetting('agentDelivery', { enabled: true, botId: 'existing', targetId: 'existing', uids: [] });
    store.db.prepare("DELETE FROM settings WHERE key='workdayDefaults:1'").run();
    store.close(); store = new Store(directory);
    assert.equal(store.getSetting('schedule:weibo').windows[0].repeat, 'weekdays');
    assert.equal(store.getSetting('targetPolicy:author').schedule.windows[0].repeat, 'daily');
    assert.equal(store.getSetting('targetPolicy:author').intervalMs, 123000);
    assert.equal(store.getSetting('monitorEnabled'), false);
    assert.equal(store.getSetting('agentDelivery').targetId, 'existing');
    store.setSetting('schedule:weibo', schedule);
    store.close(); store = new Store(directory);
    assert.equal(store.getSetting('schedule:weibo').windows[0].repeat, undefined, '迁移不在每次重启重复覆盖后续设置');
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('旧提醒只在唯一正文与时间均匹配时补关联，不伪造旧记录的监控发现时间', () => {
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-old-times-')); let store;
  try {
    store = new Store(directory); store.addTarget('1234567890', '测试博主', 500);
    const post = { id: '1', uid: '1234567890', author: '测试博主', publishedAt: 1000, text: '第一条', url: 'https://example.test/1', quote: null, complete: true, raw: {} };
    store.savePost(post, 3000, 'updates');
    store.notice('update', '测试博主 更新了：第一条', 3000, post.uid);
    store.notice('update', '测试博主 更新了：无法匹配的提醒', 3000, post.uid);
    store.db.prepare("DELETE FROM settings WHERE key='noticePostLinks:1'").run();
    store.close(); store = new Store(directory);
    const linked = store.notices().find(row => row.message.endsWith('第一条'));
    assert.equal(linked.post_id, '1'); assert.equal(linked.published_at, 1000); assert.equal(linked.saved_at, 3000);
    assert.equal(linked.detected_at, null);
    assert.equal(store.notices().find(row => row.message.endsWith('无法匹配的提醒')).post_id, null);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
