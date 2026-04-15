// src/daemon/server.ts
import express, { type Request, type Response } from 'express';
import { createServer as createHttpServer, type Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Session,
  ApiResponse,
  ApiErrorResponse,
  RegisterSessionRequest,
  UpdateSessionRequest,
  SessionEvent,
  PromptSubmitRequest,
  ToolStartRequest,
  ToolEndRequest,
  UserPrompt,
  ToolCall,
  SubagentStartRequest,
  SubagentStopRequest,
  SubagentCall,
  CompactRequest,
  CompactEvent,
} from '../types.js';
import { sessionStore } from './store.js';
import { discoverClaudeSessions, ensureSessionExists } from './discovery.js';
import {
  broadcastSessionUpdate,
  broadcastSessionRemoved,
  broadcastNewPrompt,
  broadcastToolStart,
  broadcastToolEnd,
  broadcastSubagentStart,
  broadcastSubagentStop,
  broadcastCompact,
} from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// 静态文件服务 (Dashboard)
const publicPath = path.join(__dirname, 'public');
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

  // 广播会话更新
  broadcastSessionUpdate(session);

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
 * 如果会话已被假关闭（从追踪列表移除），自动重新注册
 */
app.patch('/api/sessions/:pid', async (req: Request<{ pid: string }, ApiResponse<Session> | ApiErrorResponse, UpdateSessionRequest>, res: Response<ApiResponse<Session> | ApiErrorResponse>) => {
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

  // 会话不存在时自动重新注册（假关闭后 hooks 再次触发的场景）
  if (!sessionStore.get(pid)) {
    const discovered = await ensureSessionExists(pid);
    if (!discovered) {
      res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found and cannot be discovered`));
      return;
    }
    broadcastSessionUpdate(discovered);
  }

  const session = sessionStore.update(pid, status, message);
  if (!session) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  // 广播会话更新
  broadcastSessionUpdate(session);

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

  // 广播会话移除
  broadcastSessionRemoved(pid);

  res.json(success(null));
});

/**
 * GET /api/health - 健康检查
 */
app.get('/api/health', (_req: Request, res: Response<ApiResponse<{ status: string; sessions: number }>>) => {
  res.json(success({ status: 'ok', sessions: sessionStore.count }));
});

/**
 * POST /api/discover - 手动触发进程发现
 * 扫描进程表，发现并注册已运行但未追踪的 Claude Code 会话
 */
app.post('/api/discover', async (_req: Request, res: Response<ApiResponse<Session[]> | ApiErrorResponse>) => {
  try {
    const discovered = await discoverClaudeSessions();
    res.json(success(discovered));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json(error('DISCOVERY_FAILED', message));
  }
});

/**
 * GET /api/events - 获取事件历史
 */
app.get('/api/events', (_req: Request, res: Response<ApiResponse<SessionEvent[]>>) => {
  const events = sessionStore.getEvents();
  res.json(success(events));
});

// ========== 增强功能：用户提问 API ==========

/**
 * POST /api/sessions/:pid/prompts - 记录用户提问
 * 如果会话已被假关闭，自动重新注册
 */
app.post('/api/sessions/:pid/prompts', async (req: Request<{ pid: string }, ApiResponse<UserPrompt> | ApiErrorResponse, PromptSubmitRequest>, res: Response<ApiResponse<UserPrompt> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const { prompt } = req.body;
  if (!prompt) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required field: prompt'));
    return;
  }

  // 会话不存在时自动重新注册
  if (!sessionStore.get(pid)) {
    const discovered = await ensureSessionExists(pid);
    if (discovered) broadcastSessionUpdate(discovered);
  }

  const userPrompt = sessionStore.addPrompt(pid, { prompt });
  if (!userPrompt) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  // 广播新提问
  broadcastNewPrompt(pid, userPrompt);

  res.status(201).json(success(userPrompt));
});

/**
 * GET /api/sessions/:pid/prompts - 获取提问历史
 */
app.get('/api/sessions/:pid/prompts', (req: Request<{ pid: string }>, res: Response<ApiResponse<UserPrompt[]> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const prompts = sessionStore.getPrompts(pid);
  res.json(success(prompts));
});

// ========== 增强功能：工具调用 API ==========

/**
 * POST /api/sessions/:pid/tools - 开始工具调用
 * 如果会话已被假关闭，自动重新注册
 */
app.post('/api/sessions/:pid/tools', async (req: Request<{ pid: string }, ApiResponse<ToolCall> | ApiErrorResponse, ToolStartRequest>, res: Response<ApiResponse<ToolCall> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const { tool, input } = req.body;
  if (!tool) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required field: tool'));
    return;
  }

  // 会话不存在时自动重新注册
  if (!sessionStore.get(pid)) {
    const discovered = await ensureSessionExists(pid);
    if (discovered) broadcastSessionUpdate(discovered);
  }

  const toolCall = sessionStore.startToolCall(pid, { tool, input: input || {} });
  if (!toolCall) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  // 广播工具调用开始
  broadcastToolStart(pid, toolCall);

  res.status(201).json(success(toolCall));
});

/**
 * PATCH /api/sessions/:pid/tools/:toolCallId - 结束工具调用
 */
app.patch('/api/sessions/:pid/tools/:toolCallId', (req: Request<{ pid: string; toolCallId: string }, ApiResponse<ToolCall> | ApiErrorResponse, ToolEndRequest>, res: Response<ApiResponse<ToolCall> | ApiErrorResponse>) => {
  const { pid, toolCallId } = req.params;
  const { success: successFlag, error: errorMsg } = req.body;

  const toolCall = sessionStore.endToolCall(toolCallId, {
    success: successFlag ?? true,
    error: errorMsg,
  });

  if (!toolCall) {
    res.status(404).json(error('TOOL_CALL_NOT_FOUND', `Tool call ${toolCallId} not found`));
    return;
  }

  // 广播工具调用结束
  broadcastToolEnd(parseInt(pid, 10), toolCallId, toolCall.duration || 0, toolCall.status === 'success');

  res.json(success(toolCall));
});

/**
 * GET /api/sessions/:pid/tools - 获取工具调用历史
 */
app.get('/api/sessions/:pid/tools', (req: Request<{ pid: string }>, res: Response<ApiResponse<ToolCall[]> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const toolCalls = sessionStore.getToolCalls(pid);
  res.json(success(toolCalls));
});

/**
 * GET /api/sessions/:pid/stats - 获取工具调用统计
 */
app.get('/api/sessions/:pid/stats', (req: Request<{ pid: string }>, res: Response<ApiResponse<{ prompts: number; toolCalls: number; byTool: Record<string, number>; errorCount: number; errorByTool: Record<string, number>; subagents: number; compacts: number }> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const prompts = sessionStore.getPrompts(pid);
  const stats = sessionStore.getToolStats(pid);
  const subagents = sessionStore.getSubagentCalls(pid);
  const compacts = sessionStore.getCompactEvents(pid);

  res.json(success({
    prompts: prompts.length,
    toolCalls: stats.totalCalls,
    byTool: stats.byTool,
    errorCount: stats.errorCount,
    errorByTool: stats.errorByTool,
    subagents: subagents.length,
    compacts: compacts.length,
  }));
});

// ========== 子代理 API ==========

/**
 * POST /api/sessions/:pid/subagents - 子代理启动
 * 如果会话已被假关闭，自动重新注册
 */
app.post('/api/sessions/:pid/subagents', async (req: Request<{ pid: string }, ApiResponse<SubagentCall> | ApiErrorResponse, SubagentStartRequest>, res: Response<ApiResponse<SubagentCall> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const { agentType, description } = req.body;
  if (!agentType) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required field: agentType'));
    return;
  }

  // 会话不存在时自动重新注册
  if (!sessionStore.get(pid)) {
    const discovered = await ensureSessionExists(pid);
    if (discovered) broadcastSessionUpdate(discovered);
  }

  const subagent = sessionStore.startSubagent(pid, { agentType, description });
  if (!subagent) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  broadcastSubagentStart(pid, subagent);

  // 广播会话状态更新（包含 activeSubagentsCount）
  const session = sessionStore.get(pid);
  if (session) broadcastSessionUpdate(session);

  res.status(201).json(success(subagent));
});

/**
 * PATCH /api/sessions/:pid/subagents/:subagentId - 子代理停止
 */
app.patch('/api/sessions/:pid/subagents/:subagentId', (req: Request<{ pid: string; subagentId: string }, ApiResponse<SubagentCall> | ApiErrorResponse, SubagentStopRequest>, res: Response<ApiResponse<SubagentCall> | ApiErrorResponse>) => {
  const { pid, subagentId } = req.params;
  const { success: successFlag, error: errorMsg } = req.body;

  const subagent = sessionStore.stopSubagent(subagentId, {
    success: successFlag ?? true,
    error: errorMsg,
  });

  if (!subagent) {
    res.status(404).json(error('SUBAGENT_NOT_FOUND', `Subagent ${subagentId} not found`));
    return;
  }

  broadcastSubagentStop(parseInt(pid, 10), subagentId, subagent.duration || 0, subagent.status === 'completed');

  // 广播会话状态更新
  const session = sessionStore.get(parseInt(pid, 10));
  if (session) broadcastSessionUpdate(session);

  res.json(success(subagent));
});

/**
 * GET /api/sessions/:pid/subagents - 获取子代理历史
 */
app.get('/api/sessions/:pid/subagents', (req: Request<{ pid: string }>, res: Response<ApiResponse<SubagentCall[]> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const subagents = sessionStore.getSubagentCalls(pid);
  res.json(success(subagents));
});

// ========== 上下文压缩 API ==========

/**
 * POST /api/sessions/:pid/compacts - 记录压缩事件
 */
app.post('/api/sessions/:pid/compacts', (req: Request<{ pid: string }, ApiResponse<CompactEvent> | ApiErrorResponse, CompactRequest>, res: Response<ApiResponse<CompactEvent> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const { conversationId } = req.body;
  if (!conversationId) {
    res.status(400).json(error('INVALID_REQUEST', 'Missing required field: conversationId'));
    return;
  }

  const compactEvent = sessionStore.addCompactEvent(pid, { conversationId });
  if (!compactEvent) {
    res.status(404).json(error('SESSION_NOT_FOUND', `Session with PID ${pid} not found`));
    return;
  }

  broadcastCompact(pid, compactEvent);

  res.status(201).json(success(compactEvent));
});

/**
 * GET /api/sessions/:pid/compacts - 获取压缩事件历史
 */
app.get('/api/sessions/:pid/compacts', (req: Request<{ pid: string }>, res: Response<ApiResponse<CompactEvent[]> | ApiErrorResponse>) => {
  const pid = parseInt(req.params.pid, 10);

  if (isNaN(pid)) {
    res.status(400).json(error('INVALID_PID', 'Invalid PID format'));
    return;
  }

  const compacts = sessionStore.getCompactEvents(pid);
  res.json(success(compacts));
});

/**
 * 获取 Express app（用于创建多个 server 实例共享路由）
 */
export function getApp() {
  return app;
}
