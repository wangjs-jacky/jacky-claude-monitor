name: claude-code-monitor-install
description: 安装 Claude Code Monitor - 优雅的 Claude Code 会话监控工具，带 Swift 悬浮窗通知。当用户要求安装监控、配置 hooks、或提到 "claude-code-monitor" 时触发。
---

# Claude Code Monitor 安装技能

此技能帮助用户安装和配置 Claude Code Monitor。

## 功能特性

- 🎨 Swift 悬浮窗 - 原生 macOS 体验
- 🧠 状态监控 - thinking、executing、waiting_input
- ⏳ 等待提醒 - 脉冲动画提醒
- 📊 Web Dashboard - 实时会话状态

## 安装步骤

### 步骤 1: 检查系统要求

```bash
# 检查 macOS
uname -s

# 检查依赖
which jq curl swiftc
```

如果缺少依赖：
- jq: `brew install jq`
- Swift: `xcode-select --install`

### 步骤 2: 创建安装目录并下载文件

```bash
# 创建目录
mkdir -p ~/.claude-monitor/hooks

# 下载 Hooks（替换为实际仓库地址）
for hook in session-start session-end prompt-submit waiting-input input-answered tool-start tool-end; do
  curl -fsSL "https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/hooks/${hook}.sh" -o "~/.claude-monitor/hooks/${hook}.sh"
  chmod +x "~/.claude-monitor/hooks/${hook}.sh"
done

# 下载并编译 Swift 悬浮窗
curl -fsSL "https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/swift-notify/main.swift" -o /tmp/main.swift
swiftc -o ~/.claude-monitor/claude-float-window /tmp/main.swift -framework Cocoa
chmod +x ~/.claude-monitor/claude-float-window
```

### 步骤 3: 克隆并启动守护进程

```bash
git clone https://github.com/你的用户名/jacky-claude-monitor.git
cd jacky-claude-monitor
pnpm install
pnpm build
node dist/cli.js start
```

### 步骤 4: 配置 Claude Code Hooks

读取当前的 `~/.claude/settings.json`，然后添加以下 hooks 配置（保留现有内容）：

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

## 验证安装

```bash
# 检查文件是否安装
ls -la ~/.claude-monitor/
ls -la ~/.claude-monitor/hooks/

# 测试悬浮窗
~/.claude-monitor/claude-float-window thinking "Test" "Testing..." "vscode" 3

# 检查守护进程
curl http://localhost:17530/api/health
```

## 使用说明

- Dashboard: http://localhost:17530/dashboard
- CLI 命令: `node dist/cli.js list`
- 停止守护进程: `node dist/cli.js stop`
