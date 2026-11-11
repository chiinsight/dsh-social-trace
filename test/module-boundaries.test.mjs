import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { platformModules } from '../lib/platforms/registry.js';

test('公共调度、资料库和 Agent 不直接依赖某个平台的实现与私有数据表', () => {
  for (const file of ['worker.js', 'store.js', 'business.js', 'chat.js', 'agent.js']) {
    const source = readFileSync(new URL('../lib/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\/platforms\/(?:douyin|weibo|xueqiu)\//, file);
    assert.doesNotMatch(source, /video_records/, file);
  }
  for (const id of Object.keys(platformModules)) {
    for (const file of readdirSync(new URL('../lib/platforms/' + id + '/', import.meta.url)).filter(file => file.endsWith('.js'))) {
      const source = readFileSync(new URL('../lib/platforms/' + id + '/' + file, import.meta.url), 'utf8');
      for (const other of Object.keys(platformModules).filter(other => other !== id)) assert.doesNotMatch(source, new RegExp("from ['\"][^'\"]*\\.\\./" + other + '/'), id + '/' + file);
    }
  }
});

test('平台声明各自调度能力，Agent 可读配置不暴露模型路径或执行程序', () => {
  assert.equal(platformModules.weibo.intervalScheduling, true);
  assert.equal(platformModules.xueqiu.intervalScheduling, true);
  assert.equal(platformModules.douyin.intervalScheduling, false);
  const store = { getSetting: key => key === 'douyinConfig' ? { times: ['18:00'], modelPath: '/SYNTHETIC_PRIVATE_MODEL', python: '/SYNTHETIC_PRIVATE_PYTHON' } : null };
  const config = platformModules.douyin.publicConfig(store, { uid: 'douyin:SYNTHETIC' });
  assert.deepEqual(config.dailySchedule.times, ['18:00']);
  assert.doesNotMatch(JSON.stringify(config), /SYNTHETIC_PRIVATE|modelPath|python|ffmpeg/);
});
