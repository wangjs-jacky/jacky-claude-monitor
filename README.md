# Claude Code Monitor

监控所有 Claude Code 会话，当等待输入或会话结束时通过优雅的悬浮窗通知用户。

## ✨ 功能特性

- 🎨 **Swift 悬浮窗** - 原生 macOS 体验，带渐变背景和动画效果
- 🧠 **状态监控** - 实时追踪 thinking、executing、waiting_input 等状态
- ⏳ **等待提醒** - Claude 等待输入时显示醒目的脉冲动画悬浮窗
- ⚙️ **灵活配置** - 可自定义弹窗场景、持续时间、工具过滤
- 📊 **Web Dashboard** - 实时查看所有会话状态和事件历史
- 🧟 **僵尸检测** - 自动检测并清理异常终止的会话
- 💻 **CLI 工具** - 便捷的命令行管理工具

## 🚀 快速安装

### 方式一：npx 一键安装（推荐）

```bash
# 安装 hooks 和悬浮窗
npx claude-code-monitor init

# 查看配置信息
npx claude-code-monitor config
```

### 方式二：Prompt 安装

在 Claude Code 中复制粘贴以下内容：

```
请帮我安装 Claude Code Monitor。

1. 创建目录：mkdir -p ~/.claude-monitor/hooks
2. 从 https://github.com/你的用户名/jacky-claude-monitor/tree/main/hooks 下载所有 .sh 文件到 ~/.claude-monitor/hooks/
3. 下载并编译 Swift 悬浮窗：
   curl -o /tmp/main.swift https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/swift-notify/main.swift
   swiftc -o ~/.claude-monitor/claude-float-window /tmp/main.swift -framework Cocoa
4. 配置 Claude Code Hooks（运行 npx claude-code-monitor config 查看配置）
```

### 方式三：Skill 安装

如果你使用 Superpowers，可以使用 skill：

```
/claude-code-monitor-install
```

### 方式四：手动安装

```bash
# 克隆仓库
git clone https://github.com/你的用户名/jacky-claude-monitor.git
cd jacky-claude-monitor

# 运行本地安装脚本
./scripts/local-install.sh
```

## ⚙️ 配置 Hooks

在 Claude Code 会话中运行 `/hooks` 命令，添加以下 Hook 文件：

| Hook 类型 | 文件路径 | 说明 |
|-----------|----------|------|
| SessionStart | `~/.claude-monitor/hooks/session-start.sh` | 会话开始 |
| SessionEnd | `~/.claude-monitor/hooks/session-end.sh` | 会话结束 |
| UserPromptSubmit | `~/.claude-monitor/hooks/prompt-submit.sh` | 用户提问 |
| PreToolUse (AskUserQuestion) | `~/.claude-monitor/hooks/waiting-input.sh` | 等待输入 |
| PostToolUse (AskUserQuestion) | `~/.claude-monitor/hooks/input-answered.sh` | 输入已响应 |
| PreToolUse | `~/.claude-monitor/hooks/tool-start.sh` | 工具调用开始 |
| PostToolUse | `~/.claude-monitor/hooks/tool-end.sh` | 工具调用结束 |

<details>
<summary>📄 手动配置 settings.json</summary>

将以下内容添加到 `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-start.sh" }] }
    ],
    "SessionEnd": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-end.sh" }] }
    ],
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/prompt-submit.sh" }] }
    ],
    "PreToolUse": [
      { "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/waiting-input.sh" }] },
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-start.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/input-answered.sh" }] },
      { "matcher": "", "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-end.sh" }] }
    ]
  }
}
```
</details>

## 🖥️ 启动守护进程

```bash
# 在项目目录中
node dist/cli.js start

# 或使用 pnpm
pnpm start
```

访问 Dashboard: http://localhost:17530/dashboard

## ⚙️ 配置管理

### 查看当前配置

```bash
claude-monitor config
```

### 修改配置

```bash
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

# 重置为默认配置
claude-monitor reset
```

### 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `floatingWindow.enabled` | 悬浮窗总开关 | `true` |
| `floatingWindow.scenarios.thinking.enabled` | 思考中弹窗 | `true` |
| `floatingWindow.scenarios.thinking.duration` | 思考弹窗持续时间(秒) | `3` |
| `floatingWindow.scenarios.executing.enabled` | 执行工具弹窗 | `true` |
| `floatingWindow.scenarios.executing.duration` | 执行弹窗持续时间(秒) | `2` |
| `floatingWindow.scenarios.executing.tools` | 显示弹窗的工具列表 | `["Bash", "Task"]` |
| `floatingWindow.scenarios.waitingInput.enabled` | 等待输入弹窗 | `true` |
| `floatingWindow.scenarios.waitingInput.duration` | 等待弹窗持续时间(0=一直显示) | `0` |
| `floatingWindow.scenarios.sessionEnd.enabled` | 会话结束弹窗 | `true` |
| `floatingWindow.scenarios.sessionEnd.duration` | 结束弹窗持续时间(秒) | `3` |

配置文件位置: `~/.claude-monitor/config.json`

## 📋 CLI 命令

```bash
claude-monitor init              # 安装 Hooks 和悬浮窗
claude-monitor config            # 查看当前配置
claude-monitor set <key> <value> # 修改配置
claude-monitor reset             # 重置为默认配置
claude-monitor start             # 启动守护进程
claude-monitor stop              # 停止守护进程
claude-monitor status            # 查看守护进程状态
claude-monitor list              # 列出所有活跃会话
claude-monitor list --verbose    # 详细模式（显示提问和工具调用历史）
claude-monitor help              # 显示帮助信息
```

## 🗑️ 卸载

```bash
# 运行卸载脚本
./uninstall.sh

# 或手动删除
rm -rf ~/.claude-monitor
```

## 🔧 开发

```bash
pnpm dev:daemon   # 开发模式运行守护进程
pnpm dev:web      # 开发模式运行前端
pnpm build        # 构建后端
pnpm build:web    # 构建前端
pnpm build:all    # 构建全部
```

## 📁 项目结构

```
├── src/
│   ├── config/          # 配置管理
│   ├── daemon/          # 守护进程
│   │   ├── index.ts     # 入口
│   │   ├── server.ts    # HTTP API
│   │   ├── store.ts     # 会话存储
│   │   ├── websocket.ts # WebSocket
│   │   └── zombie.ts    # 僵尸检测
│   ├── cli/             # CLI 工具
│   ├── notify/          # 通知模块
│   ├── types.ts         # 类型定义
│   └── web/             # 前端 Dashboard
├── hooks/               # Claude Code Hooks
│   ├── common/          # 公共函数
│   │   └── config.sh    # 配置读取
│   ├── session-start.sh
│   ├── session-end.sh
│   ├── prompt-submit.sh
│   ├── waiting-input.sh
│   ├── input-answered.sh
│   ├── tool-start.sh
│   └── tool-end.sh
├── swift-notify/        # Swift 悬浮窗
│   ├── main.swift
│   └── build.sh
├── skills/              # Superpowers 技能
│   └── claude-code-monitor-install.md
├── prompt/              # 安装 Prompt
│   └── install-prompt.md
├── scripts/             # 安装脚本
├── install.sh           # 一键安装
├── uninstall.sh         # 卸载脚本
└── dist/                # 构建产物
```

## 🔌 API

守护进程在端口 17530 提供 HTTP API:

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/sessions | 注册会话 |
| GET | /api/sessions | 获取所有会话 |
| GET | /api/sessions/:pid | 获取单个会话 |
| PATCH | /api/sessions/:pid | 更新会话状态 |
| DELETE | /api/sessions/:pid | 删除会话 |
| POST | /api/sessions/:pid/prompts | 记录提问 |
| GET | /api/sessions/:pid/prompts | 获取提问历史 |
| POST | /api/sessions/:pid/tools | 开始工具调用 |
| PATCH | /api/sessions/:pid/tools/:id | 结束工具调用 |
| GET | /api/sessions/:pid/tools | 获取工具调用历史 |
| GET | /api/sessions/:pid/stats | 获取统计信息 |
| GET | /api/events | 获取事件历史 |
| GET | /api/health | 健康检查 |

## 📄 详细文档

参见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 📜 许可证

MIT
