// src/cli/index.ts
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { DEFAULT_CONFIG } from '../types.js';

const execAsync = promisify(exec);

const DAEMON_URL = `http://localhost:${DEFAULT_CONFIG.port}`;

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string): void {
  console.log(message);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message: string): void {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

/**
 * 检查守护进程是否运行
 */
async function isDaemonRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${DAEMON_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * start 命令 - 启动守护进程
 */
async function startCommand(): Promise<void> {
  const running = await isDaemonRunning();
  if (running) {
    logError('守护进程已在运行中');
    process.exit(1);
  }

  logInfo('正在启动守护进程...');

  // 使用 spawn 后台运行
  const daemon = spawn('node', ['dist/daemon.js'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });

  daemon.unref();

  // 等待启动
  await new Promise(resolve => setTimeout(resolve, 1000));

  const nowRunning = await isDaemonRunning();
  if (nowRunning) {
    logSuccess('守护进程已启动');
    logInfo(`API 地址: ${DAEMON_URL}`);
  } else {
    logError('守护进程启动失败');
    process.exit(1);
  }
}

/**
 * stop 命令 - 停止守护进程
 */
async function stopCommand(): Promise<void> {
  const running = await isDaemonRunning();
  if (!running) {
    logError('守护进程未运行');
    process.exit(1);
  }

  try {
    // 查找并杀死进程
    const { stdout } = await execAsync(`lsof -ti:${DEFAULT_CONFIG.port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    for (const pid of pids) {
      process.kill(parseInt(pid, 10), 'SIGTERM');
    }

    logSuccess('守护进程已停止');
  } catch {
    logError('停止守护进程失败');
    process.exit(1);
  }
}

/**
 * status 命令 - 查看状态
 */
async function statusCommand(): Promise<void> {
  const running = await isDaemonRunning();

  if (!running) {
    log('守护进程状态: 未运行');
    return;
  }

  try {
    const response = await fetch(`${DAEMON_URL}/api/health`);
    const data = (await response.json()) as { success: boolean; data: { status: string; sessions: number } };

    if (data.success) {
      log('守护进程状态: 运行中');
      log(`API 地址: ${DAEMON_URL}`);
      log(`活跃会话: ${data.data.sessions}`);
    }
  } catch {
    logError('获取状态失败');
  }
}

/**
 * list 命令 - 列出所有会话
 */
async function listCommand(): Promise<void> {
  const running = await isDaemonRunning();
  if (!running) {
    logError('守护进程未运行');
    process.exit(1);
  }

  try {
    const response = await fetch(`${DAEMON_URL}/api/sessions`);
    const data = (await response.json()) as { success: boolean; data: Array<{
      pid: number;
      project: string;
      status: string;
      terminal: string;
      cwd: string;
      startedAt: number;
      updatedAt: number;
      message?: string;
    }> };

    if (!data.success || data.data.length === 0) {
      log('没有活跃的会话');
      return;
    }

    log(`\n活跃会话 (${data.data.length}):\n`);

    for (const session of data.data) {
      const statusIcon = session.status === 'waiting' ? '⏳' : '▶️';
      const statusColor = session.status === 'waiting' ? colors.yellow : colors.green;

      log(`${statusIcon} ${colors.cyan}${session.project}${colors.reset}`);
      log(`   PID: ${session.pid} | 终端: ${session.terminal}`);
      log(`   状态: ${statusColor}${session.status}${colors.reset}`);
      log(`   目录: ${colors.dim}${session.cwd}${colors.reset}`);

      if (session.message) {
        log(`   消息: ${session.message}`);
      }

      log('');
    }
  } catch {
    logError('获取会话列表失败');
  }
}

/**
 * 帮助信息
 */
function showHelp(): void {
  log(`
${colors.cyan}Claude Monitor${colors.reset} - Claude Code 会话监控工具

用法:
  claude-monitor <command> [options]

命令:
  start     启动守护进程
  stop      停止守护进程
  status    查看守护进程状态
  list      列出所有活跃会话
  help      显示帮助信息

示例:
  claude-monitor start
  claude-monitor list
`);
}

/**
 * 主入口
 */
async function main(): Promise<void> {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'start':
      await startCommand();
      break;
    case 'stop':
      await stopCommand();
      break;
    case 'status':
      await statusCommand();
      break;
    case 'list':
      await listCommand();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      logError(`未知命令: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});
