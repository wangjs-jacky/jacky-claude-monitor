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

## 项目结构

```
├── src/
│   ├── daemon/          # 守护进程
│   │   ├── index.ts     # 入口
│   │   ├── server.ts    # HTTP 服务
│   │   ├── store.ts     # 会话存储
│   │   └── zombie.ts    # 僵尸检测
│   ├── cli/             # CLI 工具
│   ├── notify/          # 通知模块
│   └── types.ts         # 类型定义
├── hooks/               # Claude Code Hooks
├── scripts/             # 安装脚本
└── dist/                # 构建产物
```

## 详细文档

参见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 许可证

MIT
