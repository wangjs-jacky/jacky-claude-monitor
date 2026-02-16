# Web Dashboard 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Claude Monitor 添加 React Web Dashboard，提供图形化界面查看会话状态、事件历史和操作控制。

**Architecture:** 后端添加 WebSocket 支持和事件存储，前端使用 React + Vite + TailwindCSS，构建后由 Express 服务静态文件。

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS, WebSocket, Lucide React

---

## Phase 1: 后端 - 事件存储与类型定义

### Task 1: 添加 SessionEvent 类型定义

**Files:**
- Modify: `src/types.ts`

**Step 1: 添加 SessionEvent 类型**

在 `src/types.ts` 末尾添加：

```typescript
// 会话事件类型
export type SessionEventType = 'started' | 'ended' | 'waiting' | 'resumed' | 'killed';

// 会话事件
export interface SessionEvent {
  id: string;
  type: SessionEventType;
  pid: number;
  project: string;
  timestamp: number;
  message?: string;
}

// WebSocket 消息类型
export type ServerMessage =
  | { type: 'init'; sessions: Session[]; events: SessionEvent[] }
  | { type: 'session_update'; session: Session }
  | { type: 'session_removed'; pid: number }
  | { type: 'new_event'; event: SessionEvent };

export type ClientMessage =
  | { type: 'kill_session'; pid: number };
```

**Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无错误

**Step 3: 提交**

```bash
git add src/types.ts
git commit -m "feat(types): add SessionEvent and WebSocket message types"
```

---

### Task 2: 扩展 Store 添加事件存储

**Files:**
- Modify: `src/daemon/store.ts`

**Step 1: 添加事件存储和事件记录方法**

在 `SessionStore` 类中添加：

```typescript
// 在类的开头添加私有属性
private events: SessionEvent[] = [];
private readonly MAX_EVENTS = 100;

// 添加新方法

/**
 * 记录事件
 */
addEvent(type: SessionEventType, session: Session): SessionEvent {
  const event: SessionEvent = {
    id: `${session.pid}-${Date.now()}`,
    type,
    pid: session.pid,
    project: session.project,
    timestamp: Date.now(),
    message: session.message,
  };

  this.events.unshift(event);

  // 保留最近 100 条事件
  if (this.events.length > this.MAX_EVENTS) {
    this.events = this.events.slice(0, this.MAX_EVENTS);
  }

  return event;
}

/**
 * 获取所有事件
 */
getEvents(): SessionEvent[] {
  return this.events;
}

/**
 * 清除所有事件
 */
clearEvents(): void {
  this.events = [];
}
```

**Step 2: 在 register 方法中添加事件记录**

修改 `register` 方法，在 `this.sessions.set()` 后添加：

```typescript
this.addEvent('started', session);
```

**Step 3: 在 delete 方法中添加事件记录**

修改 `delete` 方法，在 `this.sessions.delete()` 前添加：

```typescript
const session = this.sessions.get(pid);
if (session) {
  this.addEvent('ended', session);
}
```

**Step 4: 在 update 方法中添加事件记录**

修改 `update` 方法，在 `return session` 前添加：

```typescript
if (status === 'waiting') {
  this.addEvent('waiting', session);
} else if (session.status === 'waiting' && status === 'running') {
  this.addEvent('resumed', session);
}
```

**Step 5: 更新 import**

在文件顶部添加：

```typescript
import type { Session, RegisterSessionRequest, SessionStatus, SessionEvent, SessionEventType } from '../types.js';
```

**Step 6: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无错误

**Step 7: 提交**

```bash
git add src/daemon/store.ts
git commit -m "feat(store): add event storage and recording"
```

---

### Task 3: 添加 WebSocket 服务

**Files:**
- Create: `src/daemon/websocket.ts`

**Step 1: 创建 WebSocket 模块**

```typescript
// src/daemon/websocket.ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Session, SessionEvent, ServerMessage, ClientMessage } from '../types.js';
import { sessionStore } from './store.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/**
 * 初始化 WebSocket 服务器
 */
export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total: ${clients.size}`);

    // 发送初始化数据
    sendMessage(ws, {
      type: 'init',
      sessions: sessionStore.getAll(),
      events: sessionStore.getEvents(),
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total: ${clients.size}`);
    });
  });
}

/**
 * 广播消息给所有客户端
 */
export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * 发送消息给单个客户端
 */
function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 处理客户端消息
 */
function handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'kill_session':
      // 删除会话
      const session = sessionStore.get(msg.pid);
      if (session) {
        sessionStore.addEvent('killed', session);
        sessionStore.delete(msg.pid);
        broadcast({ type: 'session_removed', pid: msg.pid });
      }
      break;
  }
}
```

**Step 2: 安装 ws 依赖**

Run: `pnpm add ws && pnpm add -D @types/ws`

**Step 3: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无错误

**Step 4: 提交**

```bash
git add src/daemon/websocket.ts package.json pnpm-lock.yaml
git commit -m "feat(websocket): add WebSocket server module"
```

---

### Task 4: 集成 WebSocket 到服务器

**Files:**
- Modify: `src/daemon/server.ts`
- Modify: `src/daemon/index.ts`
- Modify: `src/daemon/store.ts`

**Step 1: 修改 server.ts 返回 HTTP Server**

修改 `src/daemon/server.ts`，将 `createServer` 改为返回 `http.Server`：

```typescript
// 在文件顶部添加
import { createServer as createHttpServer } from 'http';

// 修改 createServer 函数
export function createServer() {
  const httpServer = createHttpServer(app);
  return httpServer;
}
```

**Step 2: 修改 index.ts 集成 WebSocket**

修改 `src/daemon/index.ts`：

```typescript
// src/daemon/index.ts
import { createServer } from './server.js';
import { initWebSocket, broadcast } from './websocket.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { DEFAULT_CONFIG } from '../types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const httpServer = createServer();
const app = httpServer; // 保持兼容性

// 静态文件服务 (Dashboard)
import express from 'express';
const expressApp = express();

// 挂载 API 路由到 express app
// ... (需要重构 server.ts)

// 暂时简化：直接在 httpServer 上处理
initWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  // 启动僵尸进程检测
  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

// 优雅关闭
const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**Step 3: 重构 server.ts 支持静态文件**

完整重写 `src/daemon/server.ts`：

```typescript
// src/daemon/server.ts
import express, { type Request, type Response } from 'express';
import { createServer as createHttpServer, type Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Session, ApiResponse, ApiErrorResponse, RegisterSessionRequest, UpdateSessionRequest } from '../types.js';
import { sessionStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// 静态文件服务 (Dashboard)
const publicPath = path.join(__dirname, '../../dist/public');
app.use('/dashboard', express.static(publicPath));

// 主页重定向到 Dashboard
app.get('/', (_req, res) => {
  res.redirect('/dashboard');
});

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
 * GET /api/events - 获取事件历史
 */
app.get('/api/events', (_req: Request, res: Response<ApiResponse<import('../types.js').SessionEvent[]>>) => {
  const events = sessionStore.getEvents();
  res.json(success(events));
});

/**
 * 创建并配置 HTTP 服务器
 */
export function createServer(): Server {
  const httpServer = createHttpServer(app);
  return httpServer;
}
```

**Step 4: 更新 index.ts**

```typescript
// src/daemon/index.ts
import { createServer } from './server.js';
import { initWebSocket, broadcast } from './websocket.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { sessionStore } from './store.js';
import { DEFAULT_CONFIG, type Session, type SessionEvent } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const httpServer = createServer();

// 初始化 WebSocket
initWebSocket(httpServer);

// 监听 store 变化并广播
const originalRegister = sessionStore.register.bind(sessionStore);
const originalUpdate = sessionStore.update.bind(sessionStore);
const originalDelete = sessionStore.delete.bind(sessionStore);

sessionStore.register = (req) => {
  const session = originalRegister(req);
  broadcast({ type: 'session_update', session });
  return session;
};

sessionStore.update = (pid, status, message) => {
  const session = originalUpdate(pid, status, message);
  if (session) {
    broadcast({ type: 'session_update', session });
  }
  return session;
};

sessionStore.delete = (pid) => {
  const result = originalDelete(pid);
  if (result) {
    broadcast({ type: 'session_removed', pid });
  }
  return result;
};

httpServer.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**Step 5: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无错误

**Step 6: 提交**

```bash
git add src/daemon/server.ts src/daemon/index.ts
git commit -m "feat(daemon): integrate WebSocket and static file serving"
```

---

## Phase 2: 前端项目搭建

### Task 5: 创建前端项目目录和配置

**Files:**
- Create: `src/web/package.json`
- Create: `src/web/tsconfig.json`
- Create: `src/web/vite.config.ts`
- Create: `src/web/tailwind.config.js`
- Create: `src/web/postcss.config.js`
- Create: `src/web/index.html`

**Step 1: 创建 src/web 目录和 package.json**

```bash
mkdir -p src/web/src/components src/web/src/hooks
```

`src/web/package.json`:
```json
{
  "name": "claude-monitor-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
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

**Step 2: 创建 tsconfig.json**

`src/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`src/web/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 3: 创建 vite.config.ts**

`src/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:17530',
      '/ws': {
        target: 'ws://localhost:17530',
        ws: true,
      },
    },
  },
});
```

**Step 4: 创建 tailwind.config.js**

`src/web/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**Step 5: 创建 postcss.config.js**

`src/web/postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 6: 创建 index.html**

`src/web/index.html`:
```html
<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Monitor Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: 提交**

```bash
git add src/web/
git commit -m "feat(web): add frontend project setup with Vite and TailwindCSS"
```

---

### Task 6: 创建前端入口文件和样式

**Files:**
- Create: `src/web/src/main.tsx`
- Create: `src/web/src/index.css`

**Step 1: 创建 main.tsx**

`src/web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 2: 创建 index.css**

`src/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-900 text-gray-100;
}
```

**Step 3: 提交**

```bash
git add src/web/src/main.tsx src/web/src/index.css
git commit -m "feat(web): add entry point and global styles"
```

---

### Task 7: 创建类型定义

**Files:**
- Create: `src/web/src/types.ts`

**Step 1: 创建类型文件**

`src/web/src/types.ts`:
```typescript
// 会话状态
export type SessionStatus = 'running' | 'waiting';

// 终端类型
export type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

// 会话
export interface Session {
  pid: number;
  ppid: number;
  project: string;
  status: SessionStatus;
  terminal: TerminalType;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  message?: string;
}

// 事件类型
export type SessionEventType = 'started' | 'ended' | 'waiting' | 'resumed' | 'killed';

// 会话事件
export interface SessionEvent {
  id: string;
  type: SessionEventType;
  pid: number;
  project: string;
  timestamp: number;
  message?: string;
}

// WebSocket 消息
export type ServerMessage =
  | { type: 'init'; sessions: Session[]; events: SessionEvent[] }
  | { type: 'session_update'; session: Session }
  | { type: 'session_removed'; pid: number }
  | { type: 'new_event'; event: SessionEvent };

export type ClientMessage =
  | { type: 'kill_session'; pid: number };
```

**Step 2: 提交**

```bash
git add src/web/src/types.ts
git commit -m "feat(web): add TypeScript type definitions"
```

---

## Phase 3: 组件开发

### Task 8: 创建 useWebSocket Hook

**Files:**
- Create: `src/web/src/hooks/useWebSocket.ts`

**Step 1: 创建 Hook**

`src/web/src/hooks/useWebSocket.ts`:
```tsx
import { useEffect, useRef, useCallback, useState } from 'react';
import type { Session, SessionEvent, ServerMessage, ClientMessage } from '../types';

interface UseWebSocketReturn {
  sessions: Session[];
  events: SessionEvent[];
  connected: boolean;
  killSession: (pid: number) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'init':
        setSessions(msg.sessions);
        setEvents(msg.events);
        break;
      case 'session_update':
        setSessions((prev) => {
          const index = prev.findIndex((s) => s.pid === msg.session.pid);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = msg.session;
            return updated;
          }
          return [...prev, msg.session];
        });
        break;
      case 'session_removed':
        setSessions((prev) => prev.filter((s) => s.pid !== msg.pid));
        break;
      case 'new_event':
        setEvents((prev) => [msg.event, ...prev].slice(0, 100));
        break;
    }
  }, []);

  const killSession = useCallback((pid: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'kill_session', pid };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { sessions, events, connected, killSession };
}
```

**Step 2: 提交**

```bash
git add src/web/src/hooks/useWebSocket.ts
git commit -m "feat(web): add useWebSocket hook with auto-reconnect"
```

---

### Task 9: 创建 ControlPanel 组件

**Files:**
- Create: `src/web/src/components/ControlPanel.tsx`

**Step 1: 创建组件**

`src/web/src/components/ControlPanel.tsx`:
```tsx
import { Activity, Wifi, WifiOff } from 'lucide-react';
import type { Session } from '../types';

interface ControlPanelProps {
  sessions: Session[];
  connected: boolean;
  port: number;
}

export function ControlPanel({ sessions, connected, port }: ControlPanelProps) {
  const runningCount = sessions.filter((s) => s.status === 'running').length;
  const waitingCount = sessions.filter((s) => s.status === 'waiting').length;

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Claude Monitor
          </h1>

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              {connected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              {connected ? '已连接' : '未连接'}
            </span>

            <span className="text-gray-400">|</span>

            <span>端口: {port}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            运行: {runningCount}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            等待: {waitingCount}
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/web/src/components/ControlPanel.tsx
git commit -m "feat(web): add ControlPanel component"
```

---

### Task 10: 创建 SessionList 组件

**Files:**
- Create: `src/web/src/components/SessionList.tsx`

**Step 1: 创建组件**

`src/web/src/components/SessionList.tsx`:
```tsx
import { Play, Pause, Terminal, Trash2 } from 'lucide-react';
import type { Session } from '../types';

interface SessionListProps {
  sessions: Session[];
  onKill: (pid: number) => void;
}

export function SessionList({ sessions, onKill }: SessionListProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  const formatDuration = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    return `${Math.floor(seconds / 3600)}小时`;
  };

  const getTerminalLabel = (terminal: string) => {
    const labels: Record<string, string> = {
      vscode: 'VSCode',
      iterm: 'iTerm',
      warp: 'Warp',
      terminal: 'Terminal',
      unknown: 'Unknown',
    };
    return labels[terminal] || terminal;
  };

  if (sessions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
        <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>暂无活跃会话</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Terminal className="w-5 h-5" />
        活跃会话 ({sessions.length})
      </h2>

      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.pid}
            className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              {session.status === 'running' ? (
                <Play className="w-5 h-5 text-green-400" />
              ) : (
                <Pause className="w-5 h-5 text-yellow-400" />
              )}

              <div>
                <div className="font-medium">{session.project}</div>
                <div className="text-sm text-gray-400">
                  PID: {session.pid} | {getTerminalLabel(session.terminal)} |{' '}
                  {formatDuration(session.startedAt)}
                </div>
                {session.message && (
                  <div className="text-sm text-yellow-400 mt-1">
                    {session.message}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => onKill(session.pid)}
              className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
              title="终止会话"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/web/src/components/SessionList.tsx
git commit -m "feat(web): add SessionList component"
```

---

### Task 11: 创建 EventTimeline 组件

**Files:**
- Create: `src/web/src/components/EventTimeline.tsx`

**Step 1: 创建组件**

`src/web/src/components/EventTimeline.tsx`:
```tsx
import { Clock, Play, Square, Pause, RotateCcw, Skull } from 'lucide-react';
import type { SessionEvent } from '../types';

interface EventTimelineProps {
  events: SessionEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'started':
        return <Play className="w-4 h-4 text-green-400" />;
      case 'ended':
        return <Square className="w-4 h-4 text-gray-400" />;
      case 'waiting':
        return <Pause className="w-4 h-4 text-yellow-400" />;
      case 'resumed':
        return <RotateCcw className="w-4 h-4 text-blue-400" />;
      case 'killed':
        return <Skull className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      started: '会话开始',
      ended: '会话结束',
      waiting: '等待输入',
      resumed: '恢复运行',
      killed: '被终止',
    };
    return labels[type] || type;
  };

  if (events.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
        <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>暂无事件记录</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5" />
        事件历史 ({events.length})
      </h2>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-2 rounded hover:bg-gray-700 transition-colors"
          >
            <div className="mt-0.5">{getEventIcon(event.type)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{event.project}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {formatTime(event.timestamp)}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {getEventLabel(event.type)}
                {event.message && ` - ${event.message}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: 提交**

```bash
git add src/web/src/components/EventTimeline.tsx
git commit -m "feat(web): add EventTimeline component"
```

---

### Task 12: 创建 App 主组件

**Files:**
- Create: `src/web/src/App.tsx`

**Step 1: 创建 App 组件**

`src/web/src/App.tsx`:
```tsx
import { useWebSocket } from './hooks/useWebSocket';
import { ControlPanel } from './components/ControlPanel';
import { SessionList } from './components/SessionList';
import { EventTimeline } from './components/EventTimeline';

const PORT = 17530;

function App() {
  const { sessions, events, connected, killSession } = useWebSocket();

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <ControlPanel sessions={sessions} connected={connected} port={PORT} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SessionList sessions={sessions} onKill={killSession} />
          <EventTimeline events={events} />
        </div>
      </div>
    </div>
  );
}

export default App;
```

**Step 2: 提交**

```bash
git add src/web/src/App.tsx
git commit -m "feat(web): add App main component with layout"
```

---

## Phase 4: 构建与集成

### Task 13: 更新根 package.json 脚本

**Files:**
- Modify: `package.json`

**Step 1: 添加前端脚本**

在 `package.json` 的 `scripts` 中添加：

```json
{
  "scripts": {
    "dev:web": "cd src/web && pnpm dev",
    "build:web": "cd src/web && pnpm install && pnpm build",
    "build:all": "pnpm build && pnpm build:web"
  }
}
```

**Step 2: 提交**

```bash
git add package.json
git commit -m "feat: add frontend build scripts"
```

---

### Task 14: 安装前端依赖并构建

**Step 1: 安装前端依赖**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor/src/web && pnpm install`

**Step 2: 构建前端**

Run: `cd /Users/jiashengwang/jacky-github/jacky-claude-monitor/src/web && pnpm build`

**Step 3: 验证构建产物**

Run: `ls -la /Users/jiashengwang/jacky-github/jacky-claude-monitor/dist/public/`
Expected: 存在 index.html 和 assets 目录

**Step 4: 提交**

```bash
git add dist/public/ pnpm-lock.yaml src/web/pnpm-lock.yaml
git commit -m "build: build frontend dashboard"
```

---

### Task 15: 重新构建后端并测试

**Step 1: 重新构建后端**

Run: `pnpm build`

**Step 2: 停止旧守护进程**

Run: `kill $(lsof -ti:17530) 2>/dev/null || true`

**Step 3: 启动新守护进程**

Run: `node /Users/jiashengwang/jacky-github/jacky-claude-monitor/dist/daemon.js &`

**Step 4: 访问 Dashboard**

在浏览器打开: `http://localhost:17530/dashboard`

Expected: 显示 Dashboard 界面

**Step 5: 测试 WebSocket**

Dashboard 应该自动显示当前会话列表

**Step 6: 提交最终修改**

```bash
git status
git add -A
git commit -m "feat: complete web dashboard implementation"
```

---

## 最终检查清单

- [ ] 后端 WebSocket 正常工作
- [ ] 事件存储和记录正常
- [ ] 前端构建成功
- [ ] Dashboard 页面可访问
- [ ] WebSocket 连接正常
- [ ] 会话列表实时更新
- [ ] 事件历史正常显示
- [ ] Kill 按钮功能正常

---

## 执行选择

计划完成并保存到 `docs/plans/2025-02-16-web-dashboard-impl.md`。

**两种执行方式:**

**1. Subagent-Driven (当前会话)** - 我为每个任务派遣新的子代理，在任务之间进行代码审查，快速迭代

**2. Parallel Session (单独会话)** - 在新会话中打开 executing-plans，批量执行并设置检查点

**选择哪种方式?**
