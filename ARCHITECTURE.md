# Claude Code Monitor - 技术方案

监控所有 Claude Code 会话，当等待输入或会话结束时通知用户。

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Monitor                           │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Session 1   │  │ Session 2   │  │ Session N   │              │
│  │ (Terminal A)│  │ (Terminal B)│  │ (Terminal X)│              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Hooks 层 (Shell)                         ││
│  │  • 会话开始 → 注册到守护进程                                 ││
│  │  • 等待输入 → 更新状态 + 触发悬浮窗                          ││
│  │  • 输入响应 → 更新状态                                      ││
│  │  • 会话结束 → 注销 + 发送通知                               ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              守护进程 Daemon (TypeScript/Node.js)            ││
│  │  • HTTP API 服务 (端口 17530)                               ││
│  │  • 维护会话列表 (PID, 终端, 目录, 状态)                      ││
│  │  • 僵尸进程检测 (定期轮询)                                   ││
│  │  • 统一通知管理                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    CLI 工具 (TypeScript)                     ││
│  │  • claude-monitor start   启动守护进程                      ││
│  │  • claude-monitor stop    停止守护进程                      ││
│  │  • claude-monitor list    查看所有会话                      ││
│  │  • claude-monitor status  查看守护进程状态                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 为什么需要守护进程？

### 问题：没有守护进程时

每个 Claude Code 实例的 Hook 脚本是**独立运行**的，存在以下问题：

1. **无法聚合状态** - 不知道有多少个 Claude 在运行，各自什么状态
2. **无法统一查询** - 用户想看所有会话时没有入口
3. **僵尸会话** - 进程异常退出时无人清理，状态不更新
4. **通知冲突** - 多个会话同时等待时通知混乱

### 守护进程的 5 大职责

```
┌─────────────────────────────────────────────────────────────────┐
│                        守护进程 (Daemon)                         │
│                        端口: 17530                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. 会话注册表                                           │    │
│  │    • 记录所有活跃的 Claude Code 会话                     │    │
│  │    • 存储: PID、终端类型、工作目录、状态、时间戳          │    │
│  │    • 提供 CLI 查询: claude-monitor list                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. 状态管理                                             │    │
│  │    • 接收 Hooks 上报的状态变更                           │    │
│  │    • running ↔ waiting ↔ ended                          │    │
│  │    • 状态变更时触发对应的通知                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. 僵尸检测                                             │    │
│  │    • 定期 (每 5s) 检查注册的 PID 是否存活                │    │
│  │    • 自动清理异常退出的会话                              │    │
│  │    • 发送 "会话异常终止" 通知                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. 通知调度                                             │    │
│  │    • 避免通知轰炸 (如多个会话同时等待时合并通知)          │    │
│  │    • 统一调用 osascript 发送通知/悬浮窗                  │    │
│  │    • 记录通知历史                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 5. CLI 服务                                             │    │
│  │    • start / stop / restart                             │    │
│  │    • list / status                                      │    │
│  │    • logs                                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
Claude Code 会话 1 ──┐
Claude Code 会话 2 ──┼──► Hooks ──► HTTP ──► 守护进程 ──► CLI (用户查询)
Claude Code 会话 N ──┘                          │
                                                ▼
                                           osascript
                                          (通知/悬浮窗)
```

### 方案对比

| 方案 | 复杂度 | 功能 | 适用场景 |
|------|--------|------|----------|
| **无守护进程** | 低 | 仅通知 | 只需要提醒，不关心会话管理 |
| **有守护进程** | 中 | 通知 + 会话列表 + 僵尸检测 | 需要完整功能 |

## 增强功能：过程监控

### 可监控内容

| 事件 | Hook | 可获取数据 | 说明 |
|------|------|-----------|------|
| 用户提问 | UserPromptSubmit | 用户输入的 prompt | 记录每次用户提交的问题 |
| 工具调用 | PreToolUse | tool_name, tool_input | 记录 Claude 调用了什么工具 |
| 工具完成 | PostToolUse | tool_name, success | 记录工具执行结果 |
| 等待输入 | PreToolUse(AskUserQuestion) | 问题内容 | Claude 在问用户什么 |

### 不可监控内容

| 内容 | 原因 |
|------|------|
| Claude 的思考过程 | Claude Code 不暴露内部推理 |
| 中间推理步骤 | API 不返回 |
| Token 使用量 | 需要单独查询 API |

### 增强数据模型

```typescript
// 用户提问记录
interface UserPrompt {
  id: string;
  sessionId: number;      // 关联的会话 PID
  prompt: string;         // 用户输入内容
  timestamp: number;      // 提交时间
}

// 工具调用记录
interface ToolCall {
  id: string;
  sessionId: number;      // 关联的会话 PID
  tool: string;           // 工具名称: Read, Edit, Bash, Grep...
  input: Record<string, unknown>;  // 工具输入参数
  status: 'pending' | 'success' | 'error';
  startedAt: number;      // 开始时间
  completedAt?: number;   // 完成时间
  duration?: number;      // 耗时 (ms)
}

// 增强后的会话信息
interface Session {
  // ... 原有字段

  // 新增字段
  currentPrompt?: string;     // 当前正在处理的问题
  promptHistory: UserPrompt[]; // 提问历史 (最近 10 条)
  toolHistory: ToolCall[];    // 工具调用历史 (最近 50 条)
  toolStats: {
    totalCalls: number;       // 总调用次数
    byTool: Record<string, number>;  // 按工具统计
  };
}
```

### 监控面板示意

```
┌─────────────────────────────────────────────────────────────────┐
│  claude-monitor list --verbose                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Session: my-project (PID: 12345)                               │
│  终端: iTerm2  |  状态: 运行中  |  启动: 5分钟前                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 当前问题:                                                │    │
│  │ "帮我实现用户登录功能，包括 JWT 认证"                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 最近工具调用:                                            │    │
│  │ 14:32:01 ✓ Read    src/auth.ts              (120ms)     │    │
│  │ 14:32:03 ✓ Grep    "login" src/              (450ms)     │    │
│  │ 14:32:08 ✓ Edit    src/auth.ts              (80ms)      │    │
│  │ 14:32:12 ⏳ Bash   npm test                  ...         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  统计: 3 次提问 | 15 次工具调用 | 运行 5 分钟                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 实时状态更新

通过 WebSocket 实现实时推送：

```typescript
// 服务端 → 客户端
type ServerMessage =
  | { type: 'init'; sessions: Session[] }
  | { type: 'session_update'; session: Session }
  | { type: 'new_prompt'; sessionId: number; prompt: string }
  | { type: 'tool_start'; sessionId: number; tool: string; input: object }
  | { type: 'tool_end'; sessionId: number; tool: string; duration: number }
  | { type: 'session_removed'; pid: number };

// 客户端 → 服务端
type ClientMessage =
  | { type: 'subscribe' }
  | { type: 'kill_session'; pid: number };
```

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| **守护进程** | TypeScript + Node.js + Express | HTTP API 服务 |
| **CLI 工具** | TypeScript | 命令行交互 |
| **Hooks 脚本** | Shell + curl + jq | Claude Code 回调 |
| **悬浮窗** | osascript | macOS 原生对话框 |
| **系统通知** | osascript | macOS 通知中心 |
| **运行时** | tsx (开发) / node (生产) | |
| **构建** | tsup | 轻量打包 |
| **包管理** | pnpm | |

## 项目结构

```
jacky-claude-monitor/
├── src/
│   ├── daemon/
│   │   ├── index.ts           # 守护进程入口
│   │   ├── server.ts          # HTTP 服务
│   │   ├── store.ts           # 会话存储 (内存 + 文件持久化)
│   │   └── zombie.ts          # 僵尸进程检测
│   ├── cli/
│   │   └── index.ts           # CLI 工具
│   ├── notify/
│   │   └── index.ts           # 通知模块 (悬浮窗 + 系统通知)
│   └── types.ts               # 类型定义
│
├── hooks/                     # Claude Code Hooks (Shell)
│   ├── session-start.sh       # 会话开始
│   ├── session-end.sh         # 会话结束
│   ├── prompt-submit.sh       # 用户提交提问
│   ├── waiting-input.sh       # 等待用户输入
│   ├── input-answered.sh      # 用户已响应
│   ├── tool-start.sh          # 工具调用开始
│   └── tool-end.sh            # 工具调用结束
│
├── dist/                      # 构建产物
│   ├── daemon.js
│   └── cli.js
│
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md            # 本文档
└── README.md
```

## 数据模型

### Session 会话

```typescript
interface Session {
  pid: number;              // Claude Code 进程 ID
  ppid: number;             // 父进程 ID (终端进程)
  terminal: TerminalType;   // 终端类型
  cwd: string;              // 工作目录
  project: string;          // 项目名称 (目录名)
  status: SessionStatus;    // 会话状态
  startedAt: number;        // 开始时间戳
  updatedAt: number;        // 最后更新时间戳
  message?: string;         // 等待原因
}

type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

type SessionStatus = 'running' | 'waiting' | 'ended';
```

### 终端识别

| 终端 | 环境变量 TERM_PROGRAM | Bundle ID |
|------|----------------------|-----------|
| VSCode | `vscode` | `com.microsoft.VSCode` |
| iTerm2 | `iTerm.app` | `com.googlecode.iterm2` |
| Warp | `WarpTerminal` | `dev.warp.Warp-Stable` |
| Terminal.app | 其他 | `com.apple.Terminal` |

## API 设计

### HTTP API

**基础 URL**: `http://localhost:17530`

#### 会话管理

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/sessions` | 注册会话 | `{ pid, ppid, terminal, cwd }` |
| GET | `/api/sessions` | 获取所有会话 | - |
| GET | `/api/sessions/:pid` | 获取单个会话 | - |
| PATCH | `/api/sessions/:pid` | 更新会话状态 | `{ status, message? }` |
| DELETE | `/api/sessions/:pid` | 注销会话 | - |
| GET | `/api/health` | 健康检查 | - |
| GET | `/api/events` | 获取事件历史 | - |

#### 用户提问记录 (增强功能)

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/sessions/:pid/prompts` | 记录用户提问 | `{ prompt }` |
| GET | `/api/sessions/:pid/prompts` | 获取提问历史 | - |

#### 工具调用记录 (增强功能)

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/sessions/:pid/tools` | 开始工具调用 | `{ tool, input }` |
| PATCH | `/api/sessions/:pid/tools/:toolCallId` | 结束工具调用 | `{ success, error? }` |
| GET | `/api/sessions/:pid/tools` | 获取工具调用历史 | - |
| GET | `/api/sessions/:pid/stats` | 获取统计数据 | - |

### 请求示例

```bash
# 注册会话
curl -X POST http://localhost:17530/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"pid":12345,"ppid":12300,"terminal":"iterm","cwd":"/Users/test/project"}'

# 更新状态为等待输入
curl -X PATCH http://localhost:17530/api/sessions/12345 \
  -H "Content-Type: application/json" \
  -d '{"status":"waiting","message":"等待确认文件覆盖"}'

# 获取所有会话
curl http://localhost:17530/api/sessions

# 注销会话
curl -X DELETE http://localhost:17530/api/sessions/12345
```

### 响应格式

```typescript
// 成功响应
interface ApiResponse<T> {
  success: true;
  data: T;
}

// 错误响应
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

## Hooks 流程

### 会话生命周期

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code 会话                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  1. SessionStart Hook                                   │
│     → POST /api/sessions (注册)                         │
│     → 状态: running                                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  2. 用户交互中...                                        │
│     → UserPromptSubmit Hook (可选通知)                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  3. PreToolUse (AskUserQuestion) Hook                   │
│     → PATCH /api/sessions/:pid (status: waiting)        │
│     → 显示悬浮窗                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  4. PostToolUse (AskUserQuestion) Hook                  │
│     → PATCH /api/sessions/:pid (status: running)        │
│     → 关闭悬浮窗                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  5. SessionEnd Hook                                     │
│     → DELETE /api/sessions/:pid (注销)                  │
│     → 发送系统通知                                       │
└─────────────────────────────────────────────────────────┘
```

### Hook 脚本模板

```bash
#!/bin/bash
# hooks/session-start.sh

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
```

## 通知系统

### 系统通知

```bash
# macOS 通知
osascript -e 'display notification "会话已结束" with title "Claude Monitor" sound name "Glass"'
```

### 悬浮窗

```bash
# macOS 对话框
osascript <<EOF
display dialog "Claude 等待输入中..." ¬
  buttons {"忽略", "前往"} ¬
  default button "前往" ¬
  with title "Claude Monitor - project-name" ¬
  giving up after 300
EOF

# 返回值: {button returned:"前往"}
# 用户点击"前往"时，激活对应终端窗口
```

### 激活终端窗口

```bash
# 根据 Bundle ID 激活应用
osascript -e 'tell application "iTerm" to activate'
osascript -e 'tell application "Visual Studio Code" to activate'
```

## 僵尸进程检测

守护进程定期检查会话进程是否存活：

```typescript
// 每 5 秒检查一次
setInterval(() => {
  for (const session of store.getAll()) {
    try {
      // 发送信号 0 检查进程是否存在
      process.kill(session.pid, 0);
    } catch {
      // 进程不存在，清理会话
      store.delete(session.pid);
      sendNotification(`会话异常终止: ${session.project}`);
    }
  }
}, 5000);
```

## CLI 命令

```bash
# 启动守护进程
claude-monitor start
claude-monitor start --daemon    # 后台运行

# 停止守护进程
claude-monitor stop

# 重启守护进程
claude-monitor restart

# 查看状态
claude-monitor status

# 列出所有会话
claude-monitor list
claude-monitor list --json       # JSON 格式输出
claude-monitor list --watch      # 持续监控

# 查看日志
claude-monitor logs
claude-monitor logs --follow     # 实时查看
```

## 配置文件

**位置**: `~/.claude-monitor/config.json`

```json
{
  "port": 17530,
  "checkInterval": 5000,
  "notifications": {
    "sessionEnd": true,
    "promptSubmit": false,
    "waitingInput": true
  },
  "sounds": {
    "sessionEnd": "Glass",
    "promptSubmit": "Submarine",
    "waitingInput": "Hero"
  }
}
```

## 全局 Hooks 配置

**位置**: `~/.claude/settings.json`

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
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/prompt-submit.sh" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/waiting-input.sh" }]
      },
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-start.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/input-answered.sh" }]
      },
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-end.sh" }]
      }
    ]
  }
}
```

## 安装步骤

1. **安装依赖**
   ```bash
   pnpm install
   ```

2. **构建项目**
   ```bash
   pnpm build
   ```

3. **全局链接 CLI**
   ```bash
   pnpm link --global
   ```

4. **启动守护进程**
   ```bash
   claude-monitor start
   ```

5. **配置全局 Hooks**
   ```bash
   mkdir -p ~/.claude-monitor
   cp -r hooks ~/.claude-monitor/
   # 然后将全局 hooks 配置添加到 ~/.claude/settings.json
   ```

## 开发计划

### Phase 1: 核心功能 (P0)
- [ ] 守护进程 HTTP 服务
- [ ] 会话存储 (内存)
- [ ] CLI 基础命令 (start/stop/list)
- [ ] Hooks 脚本

### Phase 2: 通知功能 (P1)
- [ ] 系统通知
- [ ] 悬浮窗对话框
- [ ] 激活终端窗口

### Phase 3: 稳定性 (P2)
- [ ] 僵尸进程检测
- [ ] 会话持久化 (文件)
- [ ] 日志系统
- [ ] 错误处理

### Phase 4: 增强 (P3)
- [ ] launchd 自动启动
- [ ] 配置文件支持
- [ ] CLI --watch 模式
- [ ] Web Dashboard (可选)
