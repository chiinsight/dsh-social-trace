import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export function dataDirectory() {
  const directory = process.env.SOCIAL_TRACE_HOME
    ? resolve(process.env.SOCIAL_TRACE_HOME)
    : join(homedir(), '.local', 'share', 'dsh-social-trace');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function workspaceDirectory(privateDirectory) {
  const config = join(privateDirectory, 'workspace.json');
  if (!existsSync(config)) return privateDirectory;
  const value = JSON.parse(readFileSync(config, 'utf8'));
  if (typeof value.directory !== 'string' || !value.directory) throw new Error('Social Trace 信息保存位置配置无效');
  return value.directory;
}

export function saveWorkspaceDirectory(privateDirectory, directory) {
  const temporary = join(privateDirectory, 'workspace.json.tmp');
  writeFileSync(temporary, JSON.stringify({ directory }, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, join(privateDirectory, 'workspace.json'));
}

export async function chooseDirectory() {
  if (process.platform !== 'darwin') throw new Error('当前系统请在设置中填写文件夹完整路径');
  try {
    const script = `ObjC.import('AppKit');
function run() {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  app.activateIgnoringOtherApps(true);
  var panel = $.NSOpenPanel.openPanel;
  panel.canChooseFiles = false; panel.canChooseDirectories = true;
  panel.canCreateDirectories = true; panel.allowsMultipleSelection = false;
  panel.message = '选择 Social Trace 信息保存位置';
  return panel.runModal === $.NSModalResponseOK ? ObjC.unwrap(panel.URLs.objectAtIndex(0).path) : '';
}`;
    const result = await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 120000 });
    return result.stdout.trim();
  } catch (error) {
    if (error.stderr?.includes('(-128)')) return null;
    throw new Error('文件夹选择器暂不可用，请填写文件夹完整路径');
  }
}
