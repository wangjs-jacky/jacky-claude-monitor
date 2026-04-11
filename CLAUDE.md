# jacky-claude-monitor

Claude Code 会话监控工具，通过 hooks 实时追踪所有会话状态。

## 项目结构

```
src/daemon/  — 守护进程 (Express + WebSocket + Unix Socket)
src/web/     — Web Dashboard (React + WebSocket)
hooks/       — Claude Code Hook 脚本
swift-notify/ — macOS 原生悬浮窗
plugins/hooks-debug/ — Hook 数据调试插件（通过 j-skills 管理）
```

## 详细技术文档

架构设计、API、数据模型、Hooks 流程等详见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
