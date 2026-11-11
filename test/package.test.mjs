import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('npm 发布白名单包含平台代码，排除 lib 内临时凭证、数据库和内部 Markdown', t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'social-trace-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ['package.json', '.npmignore', 'lib', 'assets', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES', 'cordis.patch.yml']) cpSync(join(root, name), join(directory, name), { recursive: true });
  const excluded = ['lib/private-notes.md', 'lib/session-fixture.json', 'lib/archive.sqlite', 'lib/.env', 'lib/cookies-fixture.json', 'assets/private-notes.md', 'assets/private-export.json'];
  for (const name of excluded) writeFileSync(join(directory, name), 'SYNTHETIC_PACK_FIXTURE');
  const npm = process.env.npm_execpath || realpathSync(join(dirname(process.execPath), 'npm'));
  const output = execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json', '--cache', join(directory, 'npm-cache')], { cwd: directory, encoding: 'utf8' });
  const names = JSON.parse(output)[0].files.map(file => file.path);
  for (const name of excluded) assert.equal(names.includes(name), false, name + ' must stay private');
  for (const name of ['lib/index.js', 'lib/chat.js', 'lib/platforms/weibo/index.js', 'lib/platforms/xueqiu/index.js', 'lib/platforms/xueqiu/media.js', 'lib/platforms/registry.js', 'lib/plain-text.js', 'lib/platforms/weibo/module.js', 'lib/platforms/weibo/media.js', 'lib/platforms/xueqiu/module.js', 'lib/platforms/douyin/module.js', 'lib/platforms/douyin/client.js', 'lib/platforms/douyin/storage.js', 'lib/platforms/douyin/service.js', 'lib/platforms/douyin/index.js', 'lib/platforms/douyin/transcribe.py', 'assets/douyin.ico', 'assets/NOTICE.md', 'README.md']) assert.ok(names.includes(name), name + ' must be published');
  assert.deepEqual(names.filter(name => name.toLowerCase().endsWith('.md')).sort(), ['README.md', 'assets/NOTICE.md']);
});
