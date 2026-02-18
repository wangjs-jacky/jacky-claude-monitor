/**
 * Claude Code Monitor - 类型定义
 */

// 终端类型
export type TerminalType = 'vscode' | 'iterm' | 'warp' | 'terminal' | 'unknown';

// 会话状态（增强版）
export type SessionStatus =
  | 'idle'           // 空闲，等待用户输入
  | 'thinking'       // 正在思考/推理
  | 'executing'      // 正在执行工具
  | 'waiting_input'  // 等待用户交互 (AskUserQuestion)
  | 'done'           // 回答完成
  | 'ended';         // 会话结束

// 状态显示配置
export const STATUS_CONFIG: Record<SessionStatus, { icon: string; label: string; color: string }> = {
  idle: { icon: '💤', label: '空闲', color: 'dim' },
  thinking: { icon: '🧠', label: '思考中', color: 'yellow' },
  executing: { icon: '⚙️', label: '执行中', color: 'cyan' },
  waiting_input: { icon: '⏳', label: '等待输入', color: 'yellow' },
  done: { icon: '✅', label: '完成', color: 'green' },
  ended: { icon: '🛑', label: '已结束', color: 'red' },
};

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
  /** 悬浮窗配置 */
  floatingWindow: {
    /** 是否启用悬浮窗 */
    enabled: boolean;
    /** 各场景配置 */
    scenarios: {
      /** 思考中（用户提问后） */
      thinking: {
        enabled: boolean;
        duration: number;  // 秒，0 = 一直显示
      };
      /** 执行工具 */
      executing: {
        enabled: boolean;
        duration: number;
        /** 只对特定工具显示 */
        tools: string[];  // 空 = 所有工具
      };
      /** 等待用户输入 */
      waitingInput: {
        enabled: boolean;
        duration: number;  // 0 = 一直显示直到响应
      };
      /** 会话结束 */
      sessionEnd: {
        enabled: boolean;
        duration: number;
      };
    };
  };
  /** 通知配置（系统通知，作为悬浮窗的补充） */
  notifications: {
    sessionEnd: boolean;
    promptSubmit: boolean;
    waitingInput: boolean;
  };
}

// 默认配置
export const DEFAULT_CONFIG: Config = {
  port: 17530,
  checkInterval: 5000,
  floatingWindow: {
    enabled: true,
    scenarios: {
      thinking: {
        enabled: true,
        duration: 3,
      },
      executing: {
        enabled: true,
        duration: 2,
        tools: ['Bash', 'Task'],  // 默认只对耗时工具显示
      },
      waitingInput: {
        enabled: true,
        duration: 0,  // 一直显示
      },
      sessionEnd: {
        enabled: true,
        duration: 3,
      },
    },
  },
  notifications: {
    sessionEnd: false,  // 悬浮窗已足够，默认关闭系统通知
    promptSubmit: false,
    waitingInput: false,
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

// ========== 增强功能：过程监控 ==========

// 用户提问记录
export interface UserPrompt {
  id: string;
  sessionId: number;      // 关联的会话 PID
  prompt: string;         // 用户输入内容
  timestamp: number;      // 提交时间
}

// 工具调用状态
export type ToolCallStatus = 'pending' | 'success' | 'error';

// 工具调用记录
export interface ToolCall {
  id: string;
  sessionId: number;      // 关联的会话 PID
  tool: string;           // 工具名称: Read, Edit, Bash, Grep...
  input: Record<string, unknown>;  // 工具输入参数
  status: ToolCallStatus;
  startedAt: number;      // 开始时间
  completedAt?: number;   // 完成时间
  duration?: number;      // 耗时 (ms)
  error?: string;         // 错误信息
}

// 工具调用统计
export interface ToolStats {
  totalCalls: number;
  byTool: Record<string, number>;
}

// 增强后的会话信息
export interface SessionWithHistory extends Session {
  currentPrompt?: string;       // 当前正在处理的问题
  promptHistory: UserPrompt[];  // 提问历史 (最近 10 条)
  toolHistory: ToolCall[];      // 工具调用历史 (最近 50 条)
  toolStats: ToolStats;         // 工具调用统计
}

// 用户提问上报请求
export interface PromptSubmitRequest {
  prompt: string;
}

// 工具调用开始请求
export interface ToolStartRequest {
  tool: string;
  input: Record<string, unknown>;
}

// 工具调用结束请求
export interface ToolEndRequest {
  success: boolean;
  error?: string;
}

// ========== 会话事件 & WebSocket ==========

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
  | { type: 'new_event'; event: SessionEvent }
  // 增强功能：实时过程监控
  | { type: 'new_prompt'; sessionId: number; prompt: UserPrompt }
  | { type: 'tool_start'; sessionId: number; toolCall: ToolCall }
  | { type: 'tool_end'; sessionId: number; toolCallId: string; duration: number; success: boolean };

export type ClientMessage =
  | { type: 'kill_session'; pid: number }
  | { type: 'subscribe'; sessionIds?: number[] };  // 订阅特定会话的更新
