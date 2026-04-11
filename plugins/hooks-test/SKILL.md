---
name: hooks-test
description: "Claude Code Hooks 测试插件 - 验证所有 hook 事件的触发和数据结构正确性。安装后自动捕获事件，支持自动验证和交互式测试。"
---

# Hooks Test - Claude Code Hook 自动化测试

验证所有 Claude Code hook 事件的触发和数据结构正确性。

## 使用方法

```bash
# 安装
j-skills link /Users/jiashengwang/jacky-github/jacky-claude-monitor/plugins/hooks-test
j-skills install hooks-test -g

# 方式一：交互式测试（推荐）
bash ~/.j-skills/linked/hooks-test/bin/interactive.sh

# 方式二：先操作，后验证
# ... 在 Claude Code 中执行测试操作 ...
bash ~/.j-skills/linked/hooks-test/bin/validate.sh

# 查看报告
bash ~/.j-skills/linked/hooks-test/bin/report.sh

# 清除测试数据
rm -rf ~/.claude-hooks-test

# 卸载
j-skills uninstall hooks-test
```

## 覆盖的 Hook 事件（12 个）

| 事件 | 触发方式 | 难度 |
|------|---------|------|
| SessionStart | 启动会话 | 简单 |
| SessionEnd | 退出会话 | 简单 |
| UserPromptSubmit | 输入问题 | 简单 |
| PreToolUse | 执行工具 | 简单 |
| PostToolUse | 工具成功 | 简单 |
| PostToolUseFailure | 工具失败 | 中等 |
| Stop | 回答结束 | 简单 |
| Notification | 等待超时 | 中等 |
| PreCompact | 上下文压缩 | 难 |
| SubagentStart | 子代理启动 | 中等 |
| SubagentStop | 子代理停止 | 中等 |
| PermissionRequest | 权限请求 | 中等 |

## 目录结构

```
~/.claude-hooks-test/
├── captures/              # 按 session 分文件的捕获数据
│   └── {session_id}.jsonl
├── latest-session         # 当前 session ID
└── report.json            # 验证报告
```
