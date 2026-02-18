// src/notify/index.ts
// 注意：悬浮窗功能已由 Swift 工具 (swift-notify/) 实现
// 此模块仅保留系统通知功能，用于僵尸进程检测等场景

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 发送 macOS 系统通知
 */
export async function sendNotification(
  title: string,
  message: string,
  sound: string = 'Glass'
): Promise<void> {
  const script = `
    display notification "${escapeString(message)}" with title "${escapeString(title)}" sound name "${sound}"
  `;
  await runOsascript(script);
}

/**
 * 运行 osascript
 */
async function runOsascript(script: string): Promise<string> {
  const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
  return stdout.trim();
}

/**
 * 转义 AppleScript 字符串中的特殊字符
 */
function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
