// src/daemon/discovery.ts
// 启动时发现已运行的 Claude Code 会话

import { exec } from 'child_process';
import { promisify } from 'util';
import { sessionStore } from './store.js';
import { broadcastSessionUpdate } from './websocket.js';
import type { Session } from '../types.js';

const execAsync = promisify(exec);

interface DiscoveredProcess {
  pid: number;
  ppid: number;
  command: string;
  cwd: string;
  terminal: string;
}

/**
 * 发现并注册已运行的 Claude Code 会话
 * @returns 新发现的会话列表
 */
export async function discoverClaudeSessions(): Promise<Session[]> {
  const discovered: Session[] = [];

  try {
    const processes = await findClaudeProcesses();

    for (const proc of processes) {
      // 跳过已注册的会话
      if (sessionStore.get(proc.pid)) continue;

      // 跳过没有 CWD 的进程
      if (!proc.cwd) continue;

      // 注册发现的会话
      const session = sessionStore.register({
        pid: proc.pid,
        ppid: proc.ppid,
        terminal: proc.terminal,
        cwd: proc.cwd,
      });

      // 广播会话更新（通知前端）
      broadcastSessionUpdate(session);
      discovered.push(session);
    }

    if (discovered.length > 0) {
      console.log(`🔍 发现 ${discovered.length} 个已运行的 Claude Code 会话`);
    } else {
      console.log('🔍 未发现已运行的 Claude Code 会话');
    }
  } catch (err) {
    console.error('发现会话失败:', err);
  }

  return discovered;
}

/**
 * 查找 Claude Code 进程
 */
async function findClaudeProcesses(): Promise<DiscoveredProcess[]> {
  try {
    // 查找所有包含 "claude" 的进程
    // 排除 grep 自身和 monitor 相关进程
    const { stdout } = await execAsync(
      `ps -eo pid,ppid,command | grep -i "claude" | grep -v grep | grep -v "claude-monitor"`
    );

    if (!stdout.trim()) return [];

    const results: DiscoveredProcess[] = [];
    const lines = stdout.trim().split('\n');
    const seenPids = new Set<number>();

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) continue;

      const pid = parseInt(match[1]);
      const ppid = parseInt(match[2]);
      const command = match[3];

      // 去重
      if (seenPids.has(pid)) continue;

      // 进一步过滤：只匹配 Claude Code CLI 进程
      if (!isClaudeCodeProcess(command)) continue;
      seenPids.add(pid);

      // 获取工作目录
      const cwd = await getCwdForPid(pid);

      // 获取终端类型
      const terminal = await getTerminalForPid(ppid);

      results.push({ pid, ppid, command, cwd, terminal });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * 判断是否为 Claude Code CLI 进程
 * 排除 monitor daemon、float-window 等非 Claude Code 进程
 */
function isClaudeCodeProcess(command: string): boolean {
  // 排除 monitor 相关进程
  const excludePatterns = [
    /claude-monitor/,
    /float-window/,
    /monitor\.sock/,
    /j-skills/,           // 排除 j-skills Tauri 应用
    /node.*monitor/,      // 排除 node 运行的 monitor 脚本
  ];

  if (excludePatterns.some(p => p.test(command))) return false;

  // Claude Code CLI 的命令行特征
  const patterns = [
    /@anthropic-ai\/claude-code/,   // npm 安装路径
    /claude-code\/cli/,              // cli 入口
    /\/bin\/claude\b/,               // 二进制路径
    /\bclaude\s*$/,                   // 仅仅是 "claude" 命令（行尾）
    /\bclaude\s+--/,                  // claude --model 等
    /\bclaude\s+-\w/,                // claude -p 等
  ];

  return patterns.some(p => p.test(command));
}

/**
 * 获取进程的工作目录（通过 lsof）
 */
async function getCwdForPid(pid: number): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `lsof -p ${pid} -Fn 2>/dev/null | grep "^n/" | head -1`
    );
    if (!stdout.trim()) return '';
    // lsof 输出格式: n/path/to/cwd
    return stdout.trim().substring(1);
  } catch {
    return '';
  }
}

/**
 * 从父进程推断终端类型
 */
async function getTerminalForPid(ppid: number): Promise<string> {
  try {
    // 向上遍历父进程链（最多 5 层），找到终端进程
    let currentPid = ppid;
    for (let i = 0; i < 5; i++) {
      const { stdout } = await execAsync(
        `ps -o comm=,ppid= -p ${currentPid} 2>/dev/null`
      );
      if (!stdout.trim()) break;

      // 解析 "comm ppid" 格式
      const parts = stdout.trim().split(/\s+/);
      const comm = parts.slice(0, -1).join(' ').toLowerCase();
      const nextPid = parseInt(parts[parts.length - 1]);

      // Cursor 必须在 VSCode 之前检查（Cursor 进程名包含 "cursor"）
      if (comm.includes('cursor')) return 'cursor';
      if (comm.includes('vscode') || comm.includes('code helper')) return 'vscode';
      if (comm.includes('iterm')) return 'iterm';
      if (comm.includes('warp')) return 'warp';
      if (comm.includes('terminal')) return 'terminal';

      if (isNaN(nextPid) || nextPid <= 1) break;
      currentPid = nextPid;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
