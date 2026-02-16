# Claude Code Monitor

监控所有 Claude Code 会话，当等待输入或会话结束时通知用户。

## 功能

- **全局监控** - 监控本机所有 Claude Code 会话
- **等待输入提醒** - Claude 等待用户输入时显示悬浮窗
- **会话结束通知** - 会话结束时发送系统通知
- **快速跳转** - 点击悬浮窗可激活对应终端
- **僵尸检测** - 自动清理异常终止的会话

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 启动守护进程
claude-monitor start

# 查看所有会话
claude-monitor list
```

## 项目结构

```
├── src/
│   ├── daemon/          # 守护进程
│   ├── cli/             # CLI 工具
│   ├── notify/          # 通知模块
│   └── types.ts         # 类型定义
├── hooks/               # Claude Code Hooks
└── dist/                # 构建产物
```

## 技术栈

- TypeScript + Node.js
- Express (HTTP API)
- osascript (macOS 通知/悬浮窗)

## 详细文档

参见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## License

MIT
