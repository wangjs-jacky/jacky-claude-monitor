/**
 * 前端类型定义
 * 与后端 src/types.ts 保持同步
 */

// 终端类型
export type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

// 会话状态（与后端一致）
export type SessionStatus =
  | 'idle'             // 空闲，等待用户输入
  | 'thinking'         // 正在思考/推理
  | 'executing'        // 正在执行单个工具
  | 'multi_executing'  // 正在并行执行多个工具
  | 'waiting_input'    // 等待用户交互 (AskUserQuestion)
  | 'tool_done'        // 所有工具完成
  | 'completed'        // 整个任务完成
  | 'error';           // 执行出错

// 状态显示配置
export const STATUS_CONFIG: Record<SessionStatus, { icon: string; label: string; color: string }> = {
  idle: { icon: '💤', label: '空闲', color: 'gray' },
  thinking: { icon: '🧠', label: '思考中', color: 'yellow' },
  executing: { icon: '⚙️', label: '执行中', color: 'cyan' },
  multi_executing: { icon: '⚡', label: '并行执行', color: 'cyan' },
  waiting_input: { icon: '⏳', label: '等待输入', color: 'yellow' },
  tool_done: { icon: '✓', label: '工具完成', color: 'gray' },
  completed: { icon: '✅', label: '完成', color: 'green' },
  error: { icon: '❌', label: '出错', color: 'red' },
};

// 会话信息
export interface Session {
  pid: number;
  ppid: number;
  terminal: TerminalType;
  cwd: string;
  project: string;
  status: SessionStatus;
  startedAt: number;
  updatedAt: number;
  message?: string;
  activeSubagentsCount?: number;
  activeSubagents?: string[];
}

// 会话事件类型
export type SessionEventType = 'started' | 'ended' | 'waiting' | 'resumed' | 'killed' | 'subagent_start' | 'subagent_stop' | 'compact' | 'tool_failure';

// 会话事件
export interface SessionEvent {
  id: string;
  type: SessionEventType;
  pid: number;
  project: string;
  timestamp: number;
  message?: string;
}

// 用户提问记录
export interface UserPrompt {
  id: string;
  sessionId: number;
  prompt: string;
  timestamp: number;
}

// 工具调用记录
export interface ToolCall {
  id: string;
  sessionId: number;
  tool: string;
  input: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}

// 子代理调用记录
export interface SubagentCall {
  id: string;
  sessionId: number;
  agentType: string;
  description: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}

// 上下文压缩事件
export interface CompactEvent {
  id: string;
  sessionId: number;
  timestamp: number;
  conversationId: string;
  reason?: string;
}

// WebSocket 消息类型
export type ServerMessage =
  | { type: 'init'; sessions: Session[]; events: SessionEvent[] }
  | { type: 'session_update'; session: Session }
  | { type: 'session_removed'; pid: number }
  | { type: 'new_event'; event: SessionEvent }
  | { type: 'new_prompt'; sessionId: number; prompt: UserPrompt }
  | { type: 'tool_start'; sessionId: number; toolCall: ToolCall }
  | { type: 'tool_end'; sessionId: number; toolCallId: string; duration: number; success: boolean }
  | { type: 'subagent_start'; sessionId: number; subagent: SubagentCall }
  | { type: 'subagent_stop'; sessionId: number; subagentId: string; duration: number; success: boolean }
  | { type: 'compact'; sessionId: number; compactEvent: CompactEvent };

export type ClientMessage =
  | { type: 'kill_session'; pid: number }
  | { type: 'subscribe'; sessionIds?: number[] };
