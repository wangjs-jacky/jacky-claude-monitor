/**
 * Claude Code Monitor - 类型定义
 */

// 终端类型
export type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

// 会话状态
export type SessionStatus = 'running' | 'waiting' | 'ended';

// 会话信息
export interface Session {
  /** Claude Code 进程 ID */
  pid: number;
  /** 父进程 ID (终端进程) */
  ppid: number;
  /** 终端类型 */
  terminal: TerminalType;
  /** 工作目录 */
  cwd: string;
  /** 项目名称 (目录名) */
  project: string;
  /** 会话状态 */
  status: SessionStatus;
  /** 开始时间戳 */
  startedAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 等待原因 (status 为 waiting 时) */
  message?: string;
}

// 注册会话请求
export interface RegisterSessionRequest {
  pid: number;
  ppid: number;
  terminal: string;
  cwd: string;
}

// 更新会话请求
export interface UpdateSessionRequest {
  status: SessionStatus;
  message?: string;
}

// API 响应
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
}

// API 错误响应
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// 配置
export interface Config {
  /** 守护进程端口 */
  port: number;
  /** 僵尸检测间隔 (ms) */
  checkInterval: number;
  /** 通知配置 */
  notifications: {
    sessionEnd: boolean;
    promptSubmit: boolean;
    waitingInput: boolean;
  };
  /** 音效配置 */
  sounds: {
    sessionEnd: string;
    promptSubmit: string;
    waitingInput: string;
  };
}

// 默认配置
export const DEFAULT_CONFIG: Config = {
  port: 17530,
  checkInterval: 5000,
  notifications: {
    sessionEnd: true,
    promptSubmit: false,
    waitingInput: true,
  },
  sounds: {
    sessionEnd: 'Glass',
    promptSubmit: 'Submarine',
    waitingInput: 'Hero',
  },
};

// 终端 Bundle ID 映射
export const TERMINAL_BUNDLE_ID: Record<TerminalType, string> = {
  vscode: 'com.microsoft.VSCode',
  iterm: 'com.googlecode.iterm2',
  warp: 'dev.warp.Warp-Stable',
  terminal: 'com.apple.Terminal',
  unknown: 'com.apple.Terminal',
};

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
