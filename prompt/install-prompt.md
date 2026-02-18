# Claude Code Monitor 安装 Prompt

将以下内容复制到 Claude Code 中执行，即可自动安装和配置 Claude Code Monitor。

---

## 安装 Prompt

```
请帮我安装 Claude Code Monitor - 一个优雅的 Claude Code 会话监控工具。

执行以下步骤：

1. 检查我的系统是否满足要求（macOS，已安装 jq 和 Xcode Command Line Tools）

2. 创建安装目录并下载文件：
   - 创建 ~/.claude-monitor/hooks/ 目录
   - 从 https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/hooks/ 下载所有 .sh 文件
   - 从 https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/swift-notify/main.swift 下载 main.swift
   - 编译 Swift 悬浮窗：swiftc -o ~/.claude-monitor/claude-float-window main.swift -framework Cocoa

3. 配置 Hooks - 将以下配置添加到 ~/.claude/settings.json：

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

4. 启动守护进程（需要先克隆仓库）：
   - git clone https://github.com/你的用户名/jacky-claude-monitor.git
   - cd jacky-claude-monitor && pnpm install && pnpm build
   - node dist/cli.js start

完成后告诉我安装结果。
```

---

## 简化版 Prompt（仅配置 Hooks）

如果你已经手动下载了项目，只想配置 Hooks：

```
请帮我配置 Claude Code Monitor 的 Hooks。

将以下配置合并到 ~/.claude/settings.json 中（保留现有配置）：

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
