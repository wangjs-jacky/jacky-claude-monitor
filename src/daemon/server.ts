// src/daemon/server.ts
import express, { type Request, type Response } from 'express';
import { createServer as createHttpServer, type Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Session, ApiResponse, ApiErrorResponse, RegisterSessionRequest, UpdateSessionRequest, SessionEvent } from '../types.js';
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
app.get('/api/events', (_req: Request, res: Response<ApiResponse<SessionEvent[]>>) => {
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
