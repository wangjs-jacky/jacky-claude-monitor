# Claude Code Monitor 核心功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个守护进程来监控所有 Claude Code 会话，当等待输入或会话结束时通知用户。

**Architecture:** 使用 Express.js 构建 HTTP API 守护进程，通过 Claude Code Hooks 收集会话状态，提供 CLI 工具管理守护进程和查看会话列表。

**Tech Stack:** TypeScript, Node.js, Express, Shell (osascript/curl)

---

## 前置条件

- Node.js >= 18
- pnpm 已安装
- macOS 系统 (通知依赖 osascript)

---

## Phase 1: 会话存储模块

### Task 1: 会话存储 (Store) 模块

**Files:**
- Create: `src/daemon/store.ts`

**Step 1: 写入 Store 模块的类型定义和基础方法**

```typescript
// src/daemon/store.ts
import type { Session, RegisterSessionRequest, SessionStatus } from '../types.js';

/**
 * 会话存储管理器
 * 负责管理所有 Claude Code 会话的状态
 */
export class SessionStore {
  private sessions: Map<number, Session> = new Map();

  /**
   * 注册新会话
   */
  register(request: RegisterSessionRequest): Session {
    const now = Date.now();
    const project = this.extractProjectName(request.cwd);

    const session: Session = {
      pid: request.pid,
      ppid: request.ppid,
      terminal: this.normalizeTerminal(request.terminal),
      cwd: request.cwd,
      project,
      status: 'running',
      startedAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.pid, session);
    return session;
  }

  /**
   * 获取单个会话
   */
  get(pid: number): Session | undefined {
    return this.sessions.get(pid);
  }

  /**
   * 获取所有会话
   */
  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 更新会话状态
   */
  update(pid: number, status: SessionStatus, message?: string): Session | undefined {
    const session = this.sessions.get(pid);
    if (!session) return undefined;

    session.status = status;
    session.updatedAt = Date.now();
    if (message !== undefined) {
      session.message = message;
    }

    return session;
  }

  /**
   * 删除会话
   */
  delete(pid: number): boolean {
    return this.sessions.delete(pid);
  }

  /**
   * 获取活跃会话数量
   */
  get count(): number {
    return this.sessions.size;
  }

  /**
   * 从路径提取项目名称
   */
  private extractProjectName(cwd: string): string {
    const parts = cwd.split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * 标准化终端类型
   */
  private normalizeTerminal(terminal: string): Session['terminal'] {
    const terminalMap: Record<string, Session['terminal']> = {
      'vscode': 'vscode',
      'iTerm.app': 'iterm',
      'iTerm': 'iterm',
      'WarpTerminal': 'warp',
      'Warp': 'warp',
      'Apple_Terminal': 'terminal',
      'Terminal': 'terminal',
    };

    return terminalMap[terminal] || 'unknown';
  }
}

// 单例导出
export const sessionStore = new SessionStore();
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/daemon/store.ts
git commit -m "feat(store): add session store module"
```

---

### Task 2: HTTP 服务器模块

**Files:**
- Create: `src/daemon/server.ts`

**Step 1: 写入 HTTP 服务器代码**

```typescript
// src/daemon/server.ts
import express, { type Request, type Response } from 'express';
import type { Session, ApiResponse, ApiErrorResponse, RegisterSessionRequest, UpdateSessionRequest } from '../types.js';
import { sessionStore } from './store.js';

const app = express();
app.use(express.json());

/**
 * 成功响应辅助函数
 */
function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/**
 * 错误响应辅助函数
 */
function error(code: string, message: string): ApiErrorResponse {
  return { success: false, error: { code, message } };
}

/**
 * POST /api/sessions - 注册新会话
 */
app.post('/api/sessions', (req: Request<object, ApiResponse<Session> | ApiErrorResponse, RegisterSessionRequest>, res: Response<ApiResponse<Session> | ApiErrorResponse>) => {
  const { pid, ppid, terminal, cwd } = req.body;

  if (!pid || !ppid || !cwd) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required fields: pid, ppid, cwd'));
    return;
  }

  const session = sessionStore.register({ pid, ppid, terminal: terminal || 'unknown', cwd });
  res.status(201).json(success(session));
});

/**
 * GET /api/sessions - 获取所有会话
 */
app.get('/api/sessions', (_req: Request, res: Response<ApiResponse<Session[]>>) => {
  const sessions = sessionStore.getAll();
  res.json(success(sessions));
});

/**
 * GET /api/sessions/:pid - 获取单个会话
 */
app.get('/api/sessions/:pid', (req: Request<{ pid: string }>, res: Response<ApiResponse<Session> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const session = sessionStore.get(pid);
  if (!session) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  res.json(success(session));
});

/**
 * PATCH /api/sessions/:pid - 更新会话状态
 */
app.patch('/api/sessions/:pid', (req: Request<{ pid: string }, ApiResponse<Session> | ApiErrorResponse, UpdateSessionRequest>, res: Response<ApiResponse<Session> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const { status, message } = req.body;
  if (!status) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required field: status'));
    return;
  }

  const session = sessionStore.update(pid, status, message);
  if (!session) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  res.json(success(session));
});

/**
 * DELETE /api/sessions/:pid - 注销会话
 */
app.delete('/api/sessions/:pid', (req: Request<{ pid: string }>, res: Response<ApiResponse<null> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const deleted = sessionStore.delete(pid);
  if (!deleted) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  res.json(success(null));
});

/**
 * GET /api/health - 健康检查
 */
app.get('/api/health', (_req: Request, res: Response<ApiResponse<{ status: string; sessions: number }>>) => {
  res.json(success({ status: 'ok', sessions: sessionStore.count }));
});

/**
 * 创建并配置 Express 服务器
 */
export function createServer() {
  return app;
}
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/daemon/server.ts
git commit -m "feat(server): add HTTP API server"
```

---

### Task 3: 守护进程入口

**Files:**
- Create: `src/daemon/index.ts`

**Step 1: 写入守护进程入口代码**

```typescript
// src/daemon/index.ts
import { createServer } from './server.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const app = createServer();

const server = app.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 测试启动守护进程**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && timeout 3 pnpm dev:daemon || true`
Expected: 输出 "Claude Monitor Daemon started on port 17530"

**Step 4: 提交**

```bash
git add src/daemon/index.ts
git commit -m "feat(daemon): add daemon entry point"
```

---

## Phase 2: 通知模块

### Task 4: 通知模块

**Files:**
- Create: `src/notify/index.ts`

**Step 1: 写入通知模块代码**

```typescript
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
  return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
}
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/notify/index.ts
git commit -m "feat(notify): add notification module"
```

---

### Task 5: 僵尸进程检测

**Files:**
- Create: `src/daemon/zombie.ts`

**Step 1: 写入僵尸进程检测代码**

```typescript
// src/daemon/zombie.ts
import { sessionStore } from './store.js';
import { sendNotification } from '../notify/index.js';
import { DEFAULT_CONFIG } from '../types.js';

let checkInterval: NodeJS.Timeout | null = null;

/**
 * 启动僵尸进程检测
 */
export function startZombieChecker(intervalMs: number = DEFAULT_CONFIG.checkInterval): void {
  if (checkInterval) {
    console.log('Zombie checker already running');
    return;
  }

  console.log(`Starting zombie checker (interval: ${intervalMs}ms)`);

  checkInterval = setInterval(async () => {
    const sessions = sessionStore.getAll();

    for (const session of sessions) {
      if (!isProcessAlive(session.pid)) {
        console.log(`Detected zombie session: PID ${session.pid} (${session.project})`);
        sessionStore.delete(session.pid);

        // 发送通知
        try {
          await sendNotification(
            'Claude Monitor - 会话异常终止',
            `项目: ${session.project}`,
            'Basso'
          );
        } catch (err) {
          console.error('Failed to send notification:', err);
        }
      }
    }
  }, intervalMs);
}

/**
 * 停止僵尸进程检测
 */
export function stopZombieChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('Zombie checker stopped');
  }
}

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    // 发送信号 0 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/daemon/zombie.ts
git commit -m "feat(zombie): add zombie process detection"
```

---

### Task 6: 更新守护进程入口，集成僵尸检测

**Files:**
- Modify: `src/daemon/index.ts`

**Step 1: 更新守护进程入口**

将 `src/daemon/index.ts` 修改为：

```typescript
// src/daemon/index.ts
import { createServer } from './server.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const app = createServer();

const server = app.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  // 启动僵尸进程检测
  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

// 优雅关闭
const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/daemon/index.ts
git commit -m "feat(daemon): integrate zombie checker"
```

---

## Phase 3: CLI 工具

### Task 7: CLI 基础命令

**Files:**
- Create: `src/cli/index.ts`

**Step 1: 写入 CLI 工具代码**

```typescript
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
 * 获取会话列表
 */
async function getSessions() {
  const response = await fetch(`${DAEMON_URL}/api/sessions`);
  const data = await response.json();
  return data;
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
```

**Step 2: 运行类型检查**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): add CLI tool with start/stop/status/list commands"
```

---

## Phase 4: Hooks 脚本

### Task 8: 会话开始 Hook

**Files:**
- Create: `hooks/session-start.sh`

**Step 1: 写入会话开始 Hook 脚本**

```bash
#!/bin/bash
# hooks/session-start.sh
# Claude Code 会话开始时调用

DAEMON_URL="http://localhost:17530"
PID=$$
PPID=$(ps -o ppid= -p $$ | tr -d ' ')
TERMINAL="${TERM_PROGRAM:-unknown}"
CWD="$PWD"

# 发送到守护进程
curl -s -X POST "$DAEMON_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d "{
    \"pid\": $PID,
    \"ppid\": $PPID,
    \"terminal\": \"$TERMINAL\",
    \"cwd\": \"$CWD\"
  }" > /dev/null 2>&1

# 静默退出
exit 0
```

**Step 2: 设置执行权限**

Run: `chmod +x /Users/jiashengwang/jacky-github/jacky-claude-monitor/hooks/session-start.sh`

**Step 3: 提交**

```bash
git add hooks/session-start.sh
git commit -m "feat(hooks): add session-start hook"
```

---

### Task 9: 会话结束 Hook

**Files:**
- Create: `hooks/session-end.sh`

**Step 1: 写入会话结束 Hook 脚本**

```bash
#!/bin/bash
# hooks/session-end.sh
# Claude Code 会话结束时调用

DAEMON_URL="http://localhost:17530"
PID=$$

# 从守护进程注销
curl -s -X DELETE "$DAEMON_URL/api/sessions/$PID" > /dev/null 2>&1

# 发送系统通知
osascript -e 'display notification "会话已结束" with title "Claude Monitor" sound name "Glass"' 2>/dev/null

exit 0
```

**Step 2: 设置执行权限**

Run: `chmod +x /Users/jiashengwang/jacky-github/jacky-claude-monitor/hooks/session-end.sh`

**Step 3: 提交**

```bash
git add hooks/session-end.sh
git commit -m "feat(hooks): add session-end hook"
```

---

### Task 10: 等待输入 Hook

**Files:**
- Create: `hooks/waiting-input.sh`

**Step 1: 写入等待输入 Hook 脚本**

```bash
#!/bin/bash
# hooks/waiting-input.sh
# Claude Code 等待用户输入时调用 (PreToolUse - AskUserQuestion)

DAEMON_URL="http://localhost:17530"
PID=$$
PROJECT_NAME=$(basename "$PWD")

# 更新会话状态为 waiting
curl -s -X PATCH "$DAEMON_URL/api/sessions/$PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"waiting","message":"等待用户输入"}' > /dev/null 2>&1

# 发送系统通知
osascript -e "display notification \"Claude 正在等待输入\" with title \"Claude Monitor - $PROJECT_NAME\" sound name \"Hero\"" 2>/dev/null

exit 0
```

**Step 2: 设置执行权限**

Run: `chmod +x /Users/jiashengwang/jacky-github/jacky-claude-monitor/hooks/waiting-input.sh`

**Step 3: 提交**

```bash
git add hooks/waiting-input.sh
git commit -m "feat(hooks): add waiting-input hook"
```

---

### Task 11: 输入已响应 Hook

**Files:**
- Create: `hooks/input-answered.sh`

**Step 1: 写入输入已响应 Hook 脚本**

```bash
#!/bin/bash
# hooks/input-answered.sh
# Claude Code 用户输入已响应时调用 (PostToolUse - AskUserQuestion)

DAEMON_URL="http://localhost:17530"
PID=$$

# 更新会话状态为 running
curl -s -X PATCH "$DAEMON_URL/api/sessions/$PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"running"}' > /dev/null 2>&1

exit 0
```

**Step 2: 设置执行权限**

Run: `chmod +x /Users/jiashengwang/jacky-github/jacky-claude-monitor/hooks/input-answered.sh`

**Step 3: 提交**

```bash
git add hooks/input-answered.sh
git commit -m "feat(hooks): add input-answered hook"
```

---

## Phase 5: 构建与测试

### Task 12: 安装依赖并构建

**Step 1: 安装依赖**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm install`
Expected: 依赖安装成功

**Step 2: 构建项目**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm build`
Expected: 生成 dist/daemon.js 和 dist/cli.js

**Step 3: 验证构建产物**

Run: `ls -la /Users/jiashengwang/jacky-github/jacky-claude-monitor/dist/`
Expected: 存在 daemon.js 和 cli.js

**Step 4: 提交**

```bash
git add dist/
git commit -m "build: initial build"
```

---

### Task 13: 端到端测试

**Step 1: 启动守护进程**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor && pnpm dev:daemon &`
Expected: 输出 "Claude Monitor Daemon started on port 17530"

**Step 2: 测试健康检查 API**

Run: `curl http://localhost:17530/api/health`
Expected: 返回 `{"success":true,"data":{"status":"ok","sessions":0}}`

**Step 3: 测试注册会话 API**

Run: `curl -X POST http://localhost:17530/api/sessions -H "Content-Type: application/json" -d '{"pid":12345,"ppid":12300,"terminal":"iterm","cwd":"/Users/test/project"}'`
Expected: 返回创建的会话信息

**Step 4: 测试获取会话列表 API**

Run: `curl http://localhost:17530/api/sessions`
Expected: 返回包含刚创建会话的数组

**Step 5: 测试更新会话状态 API**

Run: `curl -X PATCH http://localhost:17530/api/sessions/12345 -H "Content-Type: application/json" -d '{"status":"waiting","message":"测试等待"}'`
Expected: 返回更新后的会话信息

**Step 6: 测试删除会话 API**

Run: `curl -X DELETE http://localhost:17530/api/sessions/12345`
Expected: 返回 `{"success":true,"data":null}`

**Step 7: 停止守护进程**

Run: `kill $(lsof -ti:17530)`

**Step 8: 提交 (如果有修改)**

```bash
git status
# 如果有修改则提交
```

---

## Phase 6: 全局配置

### Task 14: 创建全局安装脚本

**Files:**
- Create: `scripts/install.sh`

**Step 1: 写入安装脚本**

```bash
#!/bin/bash
# scripts/install.sh
# 全局安装 Claude Monitor

set -e

echo "🚀 Installing Claude Monitor..."

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 构建项目
echo "📦 Building project..."
cd "$PROJECT_DIR"
pnpm install
pnpm build

# 创建全局配置目录
CONFIG_DIR="$HOME/.claude-monitor"
mkdir -p "$CONFIG_DIR"

# 复制 hooks
echo "📋 Copying hooks to $CONFIG_DIR/hooks..."
cp -r "$PROJECT_DIR/hooks" "$CONFIG_DIR/"

# 设置执行权限
chmod +x "$CONFIG_DIR/hooks/"*.sh

# 全局链接 CLI
echo "🔗 Linking CLI globally..."
pnpm link --global

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Start the daemon: claude-monitor start"
echo "2. Add hooks to ~/.claude/settings.json (see ARCHITECTURE.md)"
```

**Step 2: 设置执行权限**

Run: `chmod +x /Users/jiashengwang/jacky-github/jacky-claude-monitor/scripts/install.sh`

**Step 3: 提交**

```bash
git add scripts/install.sh
git commit -m "feat(scripts): add global installation script"
```

---

### Task 15: 更新 README

**Files:**
- Modify: `README.md`

**Step 1: 更新 README 内容**

```markdown
# Claude Code Monitor

监控所有 Claude Code 会话，当等待输入或会话结束时通知用户。

## 功能

- 🔄 **会话管理**: 追踪所有运行中的 Claude Code 会话
- ⏳ **等待通知**: 当 Claude 等待输入时发送系统通知
- ✅ **结束通知**: 会话结束时发送通知
- 🧟 **僵尸检测**: 自动检测并清理异常终止的会话
- 💻 **CLI 工具**: 便捷的命令行管理工具

## 快速开始

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd jacky-claude-monitor

# 安装依赖并构建
pnpm install
pnpm build

# 全局链接 CLI
pnpm link --global
```

### 启动守护进程

```bash
claude-monitor start
```

### 配置 Hooks

将以下内容添加到 `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-start.sh" }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-end.sh" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/waiting-input.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/input-answered.sh" }]
      }
    ]
  }
}
```

首先复制 hooks 到全局目录:

```bash
mkdir -p ~/.claude-monitor
cp -r hooks ~/.claude-monitor/
chmod +x ~/.claude-monitor/hooks/*.sh
```

## CLI 命令

```bash
# 启动守护进程
claude-monitor start

# 停止守护进程
claude-monitor stop

# 查看状态
claude-monitor status

# 列出所有会话
claude-monitor list
```

## API

守护进程在端口 17530 提供 HTTP API:

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/sessions | 注册会话 |
| GET | /api/sessions | 获取所有会话 |
| GET | /api/sessions/:pid | 获取单个会话 |
| PATCH | /api/sessions/:pid | 更新会话状态 |
| DELETE | /api/sessions/:pid | 删除会话 |
| GET | /api/health | 健康检查 |

## 开发

```bash
# 开发模式运行守护进程
pnpm dev:daemon

# 开发模式运行 CLI
pnpm dev:cli

# 类型检查
pnpm typecheck

# 构建
pnpm build
```

## 许可证

MIT
```

**Step 2: 提交**

```bash
git add README.md
git commit -m "docs: update README with usage instructions"
```

---

## 最终检查清单

- [ ] 所有 TypeScript 文件通过类型检查
- [ ] 构建成功生成 dist/daemon.js 和 dist/cli.js
- [ ] 守护进程可以正常启动和停止
- [ ] API 端点全部正常工作
- [ ] Hooks 脚本具有执行权限
- [ ] CLI 命令正常工作
- [ ] README 文档完整

---

## 执行选择

计划完成并保存到 `docs/plans/2025-02-16-claude-monitor-core.md`。

**两种执行方式:**

**1. Subagent-Driven (当前会话)** - 我为每个任务派遣新的子代理，在任务之间进行代码审查，快速迭代

**2. Parallel Session (单独会话)** - 在新会话中打开 executing-plans，批量执行并设置检查点

**选择哪种方式?**
