/**
 * 前端类型定义
 * 与后端 src/types.ts 保持同步
 */

// 终端类型
export type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

// 会话状态（与后端一致）
export type SessionStatus =
  | 'idle'           // 空闲，等待用户输入
  | 'thinking'       // 正在思考/推理
  | 'executing'      // 正在执行工具
  | 'waiting_input'  // 等待用户交互 (AskUserQuestion)
  | 'done'           // 回答完成
  | 'ended';         // 会话结束

// 状态显示配置
export const STATUS_CONFIG: Record<SessionStatus, { icon: string; label: string; color: string }> = {
  idle: { icon: '💤', label: '空闲', color: 'gray' },
  thinking: { icon: '🧠', label: '思考中', color: 'yellow' },
  executing: { icon: '⚙️', label: '执行中', color: 'cyan' },
  waiting_input: { icon: '⏳', label: '等待输入', color: 'orange' },
  done: { icon: '✅', label: '完成', color: 'green' },
  ended: { icon: '🛑', label: '已结束', color: 'red' },
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
}

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

// WebSocket 消息类型
export type ServerMessage =
  | { type: 'init'; sessions: Session[]; events: SessionEvent[] }
  | { type: 'session_update'; session: Session }
  | { type: 'session_removed'; pid: number }
  | { type: 'new_event'; event: SessionEvent }
  | { type: 'new_prompt'; sessionId: number; prompt: UserPrompt }
  | { type: 'tool_start'; sessionId: number; toolCall: ToolCall }
  | { type: 'tool_end'; sessionId: number; toolCallId: string; duration: number; success: boolean };

export type ClientMessage =
  | { type: 'kill_session'; pid: number }
  | { type: 'subscribe'; sessionIds?: number[] };
