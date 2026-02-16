# Claude Monitor Web Dashboard 设计文档

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan.

## 概述

为 Claude Monitor 添加 React Web Dashboard，提供图形化界面查看会话状态、事件历史和操作控制。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | TailwindCSS |
| 实时通信 | WebSocket (原生) |
| 图标 | Lucide React |

## 项目结构

```
jacky-claude-monitor/
├── src/
│   ├── daemon/           # 后端
│   │   ├── index.ts
│   │   ├── server.ts     # 添加 WebSocket + 静态文件服务
│   │   ├── store.ts      # 添加事件历史
│   │   └── zombie.ts
│   ├── web/              # 前端
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── SessionList.tsx
│   │   │   │   ├── EventTimeline.tsx
│   │   │   │   └── ControlPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useWebSocket.ts
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   └── types.ts
└── dist/
    └── public/           # 前端构建产物
```

## 数据模型

### Session（现有）

```typescript
interface Session {
  pid: number;
  ppid: number;
  project: string;
  status: 'running' | 'waiting';
  terminal: string;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  message?: string;
}
```

### SessionEvent（新增）

```typescript
interface SessionEvent {
  id: string;
  type: 'started' | 'ended' | 'waiting' | 'resumed' | 'killed';
  pid: number;
  project: string;
  timestamp: number;
  message?: string;
}
```

## WebSocket 协议

### 服务端 -> 客户端

```typescript
type ServerMessage =
  | { type: 'init'; sessions: Session[]; events: SessionEvent[] }
  | { type: 'session_update'; session: Session }
  | { type: 'session_removed'; pid: number }
  | { type: 'new_event'; event: SessionEvent }
  | { type: 'daemon_status'; running: boolean };
```

### 客户端 -> 服务端

```typescript
type ClientMessage =
  | { type: 'kill_session'; pid: number };
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | Dashboard 页面 |
| GET | /api/events | 获取事件历史 |
| DELETE | /api/sessions/:pid | 终止会话（现有） |
| WS | /ws | WebSocket 连接 |

## UI 布局

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Monitor Dashboard                    ● ● ●         │
├─────────────────────────────────────────────────────────────┤
│  Control Panel                                              │
│  [启动] [停止] [清理历史]                                    │
│  状态: ● 运行中 | 会话数: 2 | 端口: 17530                   │
├─────────────────────────────────────────────────────────────┤
│  Active Sessions          │  Event History                  │
│  ──────────────────────── │  ─────────────────────────────  │
│  ▶️ my-project            │  10:32:15 🟢 started            │
│    PID: 12345 | VSCode    │              my-project         │
│    [Kill]                 │                                 │
│                           │  10:31:02 🟡 waiting            │
│  ⏳ other-project         │              other-project      │
│    PID: 12346 | iTerm     │                                 │
│    等待用户输入           │  10:30:00 🔴 ended              │
│    [Kill]                 │              old-project        │
└─────────────────────────────────────────────────────────────┘
```

## 组件设计

### App.tsx
- 主布局
- WebSocket 连接管理
- 全局状态

### ControlPanel.tsx
- 守护进程状态显示
- 启动/停止按钮
- 统计信息

### SessionList.tsx
- 会话卡片列表
- 状态图标（运行/等待）
- Kill 按钮

### EventTimeline.tsx
- 事件列表（按时间倒序）
- 事件类型图标
- 自动滚动到最新

### useWebSocket.ts
- WebSocket 连接 hook
- 自动重连
- 消息解析

## 构建流程

1. 开发模式：`pnpm dev:web` - Vite dev server
2. 生产构建：`pnpm build:web` - 输出到 dist/public
3. 守护进程启动时服务静态文件

## 依赖

### 前端 (src/web/package.json)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

## 实施阶段

1. **Phase 1**: 后端 WebSocket + 事件存储
2. **Phase 2**: 前端项目搭建
3. **Phase 3**: 组件开发
4. **Phase 4**: 集成测试
