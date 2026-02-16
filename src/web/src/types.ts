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
