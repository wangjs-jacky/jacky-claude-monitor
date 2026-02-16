// src/notify/index.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Session, TerminalType } from '../types.js';
import { TERMINAL_BUNDLE_ID } from '../types.js';

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
 * 显示等待输入的悬浮对话框
 * @returns 用户点击的按钮 ('ignore' | 'goto' | 'timeout')
 */
export async function showWaitingDialog(
  session: Session,
  timeoutSeconds: number = 300
): Promise<'ignore' | 'goto' | 'timeout'> {
  const script = `
    display dialog "Claude 等待输入中..." ¬
      buttons {"忽略", "前往"} ¬
      default button "前往" ¬
      with title "Claude Monitor - ${escapeString(session.project)}" ¬
      giving up after ${timeoutSeconds}
  `;

  try {
    const result = await runOsascript(script);
    // 解析返回值: {button returned:"前往"} 或 {gave up:true}
    if (result.includes('gave up:true')) {
      return 'timeout';
    }
    if (result.includes('button returned:忽略')) {
      return 'ignore';
    }
    return 'goto';
  } catch {
    return 'timeout';
  }
}

/**
 * 激活终端窗口
 */
export async function activateTerminal(terminal: TerminalType): Promise<void> {
  const bundleId = TERMINAL_BUNDLE_ID[terminal];
  const script = `tell application id "${bundleId}" to activate`;
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
