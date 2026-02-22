// src/cli/index.ts
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, STATUS_CONFIG, type SessionStatus, type Config } from '../types.js';
import { loadConfig, saveConfig, getConfigPath, resetConfig } from '../config/index.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const DAEMON_URL = `http://localhost:${DEFAULT_CONFIG.port}`;
const INSTALL_DIR = join(process.env.HOME || '', '.claude-monitor');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
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

function logStep(step: string, message: string): void {
  console.log(`\n${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function getStatusDisplay(status: string): { icon: string; label: string; color: string } {
  return STATUS_CONFIG[status as SessionStatus] || { icon: '❓', label: status, color: 'dim' };
}

function getColorCode(color: string): string {
  const colorMap: Record<string, string> = {
    dim: colors.dim,
    yellow: colors.yellow,
    cyan: colors.cyan,
    green: colors.green,
    red: colors.red,
  };
  return colorMap[color] || colors.reset;
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
async function listCommand(verbose: boolean = false): Promise<void> {
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
      const { icon, label, color } = getStatusDisplay(session.status);
      const statusColor = getColorCode(color);
      const duration = formatDuration(Date.now() - session.startedAt);

      log(`${icon} ${colors.cyan}${session.project}${colors.reset}`);
      log(`   PID: ${session.pid} | 终端: ${session.terminal} | 运行: ${duration}`);
      log(`   状态: ${statusColor}${label}${colors.reset}`);
      log(`   目录: ${colors.dim}${session.cwd}${colors.reset}`);

      if (session.message) {
        log(`   消息: ${session.message}`);
      }

      // 详细模式：显示提问和工具调用历史
      if (verbose) {
        await showSessionDetails(session.pid);
      }

      log('');
    }
  } catch {
    logError('获取会话列表失败');
  }
}

/**
 * 显示会话详细信息（提问和工具调用历史）
 */
async function showSessionDetails(pid: number): Promise<void> {
  try {
    // 获取提问历史
    const promptsResponse = await fetch(`${DAEMON_URL}/api/sessions/${pid}/prompts`);
    const promptsData = (await promptsResponse.json()) as { success: boolean; data: Array<{ prompt: string; timestamp: number }> };

    if (promptsData.success && promptsData.data.length > 0) {
      log(`   ${colors.dim}最近提问:${colors.reset}`);
      for (const p of promptsData.data.slice(0, 3)) {
        const truncated = p.prompt.length > 50 ? p.prompt.substring(0, 50) + '...' : p.prompt;
        log(`     ${colors.dim}•${colors.reset} ${truncated}`);
      }
    }

    // 获取工具调用历史
    const toolsResponse = await fetch(`${DAEMON_URL}/api/sessions/${pid}/tools`);
    const toolsData = (await toolsResponse.json()) as { success: boolean; data: Array<{
      tool: string;
      status: string;
      duration?: number;
      startedAt: number;
    }> };

    if (toolsData.success && toolsData.data.length > 0) {
      log(`   ${colors.dim}最近工具调用:${colors.reset}`);
      for (const t of toolsData.data.slice(0, 5)) {
        const statusIcon = t.status === 'success' ? '✓' : t.status === 'error' ? '✗' : '⏳';
        const duration = t.duration ? ` (${t.duration}ms)` : '';
        log(`     ${statusIcon} ${t.tool}${colors.dim}${duration}${colors.reset}`);
      }

      // 统计
      const statsResponse = await fetch(`${DAEMON_URL}/api/sessions/${pid}/stats`);
      const statsData = (await statsResponse.json()) as { success: boolean; data: { prompts: number; toolCalls: number; byTool: Record<string, number> } };

      if (statsData.success) {
        log(`   ${colors.dim}统计: ${statsData.data.prompts} 次提问 | ${statsData.data.toolCalls} 次工具调用${colors.reset}`);
      }
    }
  } catch {
    // 忽略详细信息的错误
  }
}

/**
 * init 命令 - 安装 hooks 和悬浮窗
 */
async function initCommand(): Promise<void> {
  console.log(`
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║         Claude Code Monitor - 安装程序                    ║
║         监控 Claude Code 会话，优雅的通知体验              ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  // 检查操作系统
  if (process.platform !== 'darwin') {
    logError('此工具目前仅支持 macOS');
    process.exit(1);
  }

  // 检查依赖
  logStep('1/4', '检查依赖...');

  const dependencies = [
    { cmd: 'jq', install: 'brew install jq' },
    { cmd: 'curl', install: 'brew install curl' },
  ];

  for (const dep of dependencies) {
    try {
      await execAsync(`which ${dep.cmd}`);
      logSuccess(`${dep.cmd} 已安装`);
    } catch {
      logError(`缺少依赖: ${dep.cmd}`);
      logInfo(`请运行: ${dep.install}`);
      process.exit(1);
    }
  }

  // 检查 Swift
  try {
    await execAsync('which swiftc');
    logSuccess('Swift 已安装');
  } catch {
    logError('缺少 Swift 编译器');
    logInfo('请运行: xcode-select --install');
    process.exit(1);
  }

  // 创建安装目录
  logStep('2/4', '创建安装目录...');
  mkdirSync(join(INSTALL_DIR, 'hooks'), { recursive: true });
  logSuccess(`目录已创建: ${INSTALL_DIR}`);

  // 复制 hooks
  logStep('3/4', '安装 Hooks...');
  const hooksDir = join(__dirname, '..', 'hooks');
  const hooks = [
    'session-start.sh',
    'session-end.sh',
    'prompt-submit.sh',
    'waiting-input.sh',
    'input-answered.sh',
    'tool-start.sh',
    'tool-end.sh',
    'notification.sh',
    'response-end.sh',
  ];

  // 如果 npm 包中的 hooks 不存在，尝试从当前目录复制
  const sourceDir = existsSync(hooksDir) ? hooksDir : join(__dirname, '..', '..', 'hooks');

  for (const hook of hooks) {
    const src = join(sourceDir, hook);
    const dest = join(INSTALL_DIR, 'hooks', hook);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      chmodSync(dest, 0o755);
      logSuccess(`已安装: ${hook}`);
    } else {
      logError(`找不到: ${hook}`);
    }
  }

  // 编译 Swift 悬浮窗
  logStep('4/4', '编译悬浮窗工具...');
  const swiftSource = join(__dirname, '..', 'swift-notify', 'main.swift');
  const swiftSourceAlt = join(__dirname, '..', '..', 'swift-notify', 'main.swift');
  const swiftFile = existsSync(swiftSource) ? swiftSource : swiftSourceAlt;
  const swiftOutput = join(INSTALL_DIR, 'claude-float-window');

  if (existsSync(swiftFile)) {
    try {
      await execAsync(`swiftc -o "${swiftOutput}" "${swiftFile}" -framework Cocoa`);
      chmodSync(swiftOutput, 0o755);
      logSuccess('悬浮窗工具已编译');
    } catch (err) {
      logError('编译失败');
      console.error(err);
      process.exit(1);
    }
  } else {
    logError('找不到 Swift 源文件');
    logInfo('悬浮窗功能将不可用');
  }

  // 生成配置提示
  console.log(`
${colors.green}${colors.bold}╔═══════════════════════════════════════════════════════════╗
║               🎉 安装成功！                                ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

安装位置: ${colors.cyan}${INSTALL_DIR}${colors.reset}

${colors.yellow}下一步:${colors.reset}

1. 启动守护进程:
   ${colors.dim}# 如果是从 npm 安装的，需要先克隆仓库启动守护进程${colors.reset}
   ${colors.cyan}git clone https://github.com/你的用户名/jacky-claude-monitor.git${colors.reset}
   ${colors.cyan}cd jacky-claude-monitor && pnpm install && pnpm build${colors.reset}
   ${colors.cyan}node dist/cli.js start${colors.reset}

2. 在 Claude Code 中配置 Hooks:
   运行 ${colors.cyan}/hooks${colors.reset} 命令，添加以下文件:

${hooks.map(h => `   ${colors.cyan}~/.claude-monitor/hooks/${h}${colors.reset}`).join('\n')}

3. 或手动添加到 ${colors.cyan}~/.claude/settings.json${colors.reset}:
   ${colors.dim}(运行 claude-monitor config 查看完整配置)${colors.reset}
`);
}

/**
 * config 命令 - 显示配置信息
 */
function configCommand(): Promise<void> {
  const config = loadConfig();

  console.log(`
${colors.cyan}Claude Code Monitor 配置${colors.reset}

${colors.yellow}配置文件:${colors.reset} ${getConfigPath()}

${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

${colors.bold}悬浮窗设置:${colors.reset}
  总开关: ${config.floatingWindow.enabled ? `${colors.green}开启${colors.reset}` : `${colors.red}关闭${colors.reset}`}

  ${colors.cyan}思考中 (thinking):${colors.reset}
    启用: ${config.floatingWindow.scenarios.thinking.enabled ? '✓' : '✗'}
    持续时间: ${config.floatingWindow.scenarios.thinking.duration}秒

  ${colors.cyan}执行工具 (executing):${colors.reset}
    启用: ${config.floatingWindow.scenarios.executing.enabled ? '✓' : '✗'}
    持续时间: ${config.floatingWindow.scenarios.executing.duration}秒
    工具过滤: ${config.floatingWindow.scenarios.executing.tools.length > 0 ? config.floatingWindow.scenarios.executing.tools.join(', ') : '全部'}

  ${colors.cyan}等待输入 (waiting_input):${colors.reset}
    启用: ${config.floatingWindow.scenarios.waitingInput.enabled ? '✓' : '✗'}
    持续时间: ${config.floatingWindow.scenarios.waitingInput.duration === 0 ? '一直显示' : config.floatingWindow.scenarios.waitingInput.duration + '秒'}

  ${colors.cyan}会话结束 (sessionEnd):${colors.reset}
    启用: ${config.floatingWindow.scenarios.sessionEnd.enabled ? '✓' : '✗'}
    持续时间: ${config.floatingWindow.scenarios.sessionEnd.duration}秒

${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

${colors.yellow}修改配置:${colors.reset}
  ${colors.cyan}claude-monitor set floatingWindow.enabled false${colors.reset}
  ${colors.cyan}claude-monitor set floatingWindow.scenarios.thinking.enabled false${colors.reset}
  ${colors.cyan}claude-monitor set floatingWindow.scenarios.executing.tools "Bash,Task"${colors.reset}

${colors.yellow}重置为默认配置:${colors.reset}
  ${colors.cyan}claude-monitor reset${colors.reset}
`);

  // 同时显示 hooks 配置
  showHooksConfig();
  return Promise.resolve();
}

/**
 * 显示 Hooks 配置
 */
function showHooksConfig(): void {
  const settings = {
    hooks: {
      SessionStart: [
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/session-start.sh' }] }
      ],
      SessionEnd: [
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/session-end.sh' }] }
      ],
      UserPromptSubmit: [
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/prompt-submit.sh' }] }
      ],
      PreToolUse: [
        { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/waiting-input.sh' }] },
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/tool-start.sh' }] }
      ],
      PostToolUse: [
        { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/input-answered.sh' }] },
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/tool-end.sh' }] }
      ],
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/response-end.sh' }] }
      ],
      Notification: [
        { matcher: '', hooks: [{ type: 'command', command: '~/.claude-monitor/hooks/notification.sh' }] }
      ]
    }
  };

  console.log(`
${colors.yellow}Claude Code Hooks 配置${colors.reset}

将以下内容添加到 ${colors.cyan}~/.claude/settings.json${colors.reset}:

${colors.dim}${JSON.stringify(settings, null, 2)}${colors.reset}
`);
}

/**
 * set 命令 - 修改配置
 */
function setCommand(key: string, value: string): Promise<void> {
  const config = loadConfig();

  // 解析 key 路径 (如 "floatingWindow.scenarios.thinking.enabled")
  const keys = key.split('.');
  const lastKey = keys.pop()!;

  // 导航到目标对象
  let target: Record<string, unknown> = config;
  for (const k of keys) {
    if (target[k] === undefined) {
      logError(`配置路径不存在: ${k}`);
      process.exit(1);
    }
    target = target[k] as Record<string, unknown>;
  }

  // 解析值
  let parsedValue: unknown;
  if (value === 'true') {
    parsedValue = true;
  } else if (value === 'false') {
    parsedValue = false;
  } else if (!isNaN(Number(value))) {
    parsedValue = Number(value);
  } else if (value.includes(',')) {
    // 数组格式: "Bash,Task" -> ["Bash", "Task"]
    parsedValue = value.split(',').map(s => s.trim());
  } else {
    parsedValue = value;
  }

  // 更新配置
  target[lastKey] = parsedValue;
  saveConfig(config);

  logSuccess(`已更新: ${key} = ${JSON.stringify(parsedValue)}`);
  logInfo(`配置文件: ${getConfigPath()}`);

  return Promise.resolve();
}

/**
 * reset 命令 - 重置配置
 */
function resetCommand(): Promise<void> {
  resetConfig();
  logSuccess('配置已重置为默认值');
  logInfo(`配置文件: ${getConfigPath()}`);
  return Promise.resolve();
}

/**
 * 格式化持续时间
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
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
  init        安装 Hooks 和悬浮窗工具（首次使用）
  config      显示当前配置
  set <key> <value>   修改配置
  reset       重置为默认配置
  start       启动守护进程
  stop        停止守护进程
  status      查看守护进程状态
  list        列出所有活跃会话
  help        显示帮助信息

选项:
  --verbose, -v    显示详细信息（提问和工具调用历史）

配置示例:
  # 关闭所有悬浮窗
  claude-monitor set floatingWindow.enabled false

  # 关闭"思考中"弹窗
  claude-monitor set floatingWindow.scenarios.thinking.enabled false

  # 关闭"执行工具"弹窗
  claude-monitor set floatingWindow.scenarios.executing.enabled false

  # 只对特定工具显示"执行中"弹窗
  claude-monitor set floatingWindow.scenarios.executing.tools "Bash,Task"

  # 修改弹窗持续时间（秒）
  claude-monitor set floatingWindow.scenarios.thinking.duration 5

  # 关闭"会话结束"弹窗
  claude-monitor set floatingWindow.scenarios.sessionEnd.enabled false

首次安装:
  npx claude-code-monitor init
`);
}

/**
 * 主入口
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const verbose = args.includes('--verbose') || args.includes('-v');

  switch (command) {
    case 'init':
      await initCommand();
      break;
    case 'config':
      await configCommand();
      break;
    case 'set':
      if (args.length < 3) {
        logError('用法: claude-monitor set <key> <value>');
        logInfo('示例: claude-monitor set floatingWindow.enabled false');
        process.exit(1);
      }
      await setCommand(args[1], args[2]);
      break;
    case 'reset':
      await resetCommand();
      break;
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
      await listCommand(verbose);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      // 检查是否是选项而不是命令
      if (command.startsWith('-')) {
        showHelp();
      } else {
        logError(`未知命令: ${command}`);
        showHelp();
        process.exit(1);
      }
  }
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});
