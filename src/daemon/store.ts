// src/daemon/store.ts
import type {
  Session,
  RegisterSessionRequest,
  SessionStatus,
  SessionEvent,
  SessionEventType,
  UserPrompt,
  ToolCall,
  ToolStats,
  PromptSubmitRequest,
  ToolStartRequest,
  ToolEndRequest,
} from '../types.js';

/**
 * 会话存储管理器
 * 负责管理所有 Claude Code 会话的状态
 */
export class SessionStore {
  private sessions: Map<number, Session> = new Map();
  private events: SessionEvent[] = [];
  private readonly MAX_EVENTS = 100;

  // 增强功能：过程监控
  private prompts: Map<number, UserPrompt[]> = new Map();  // sessionId -> prompts
  private toolCalls: Map<number, ToolCall[]> = new Map();   // sessionId -> toolCalls
  private pendingTools: Map<string, ToolCall> = new Map();   // toolCallId -> ToolCall

  private readonly MAX_PROMPTS_PER_SESSION = 10;
  private readonly MAX_TOOL_CALLS_PER_SESSION = 50;

  /**
   * 注册新会话
   */
  register(request: RegisterSessionRequest): Session {
    const now = Date.now();
    const project = this.extractProjectName(request.cwd);

    const session: Session = {
      pid: request.pid,
      ppid: request.ppid,
      terminal: this.normalizeTerminal(request.terminal),
      cwd: request.cwd,
      project,
      status: 'idle',
      startedAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.pid, session);
    this.addEvent('started', session);
    return session;
  }

  /**
   * 获取单个会话
   */
  get(pid: number): Session | undefined {
    return this.sessions.get(pid);
  }

  /**
   * 获取所有会话
   */
  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 更新会话状态
   */
  update(pid: number, status: SessionStatus, message?: string): Session | undefined {
    const session = this.sessions.get(pid);
    if (!session) return undefined;

    const oldStatus = session.status;
    session.status = status;
    session.updatedAt = Date.now();
    if (message !== undefined) {
      session.message = message;
    }

    // 记录状态变更事件
    if (status === 'waiting_input') {
      this.addEvent('waiting', session);
    } else if (oldStatus === 'waiting_input' && (status === 'thinking' || status === 'executing' || status === 'idle')) {
      this.addEvent('resumed', session);
    }

    return session;
  }

  /**
   * 删除会话
   */
  delete(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (session) {
      this.addEvent('ended', session);
      // 清理关联的提问和工具调用历史
      this.prompts.delete(pid);
      this.toolCalls.delete(pid);
    }
    return this.sessions.delete(pid);
  }

  /**
   * 获取活跃会话数量
   */
  get count(): number {
    return this.sessions.size;
  }

  // ========== 增强功能：用户提问记录 ==========

  /**
   * 记录用户提问
   */
  addPrompt(sessionId: number, request: PromptSubmitRequest): UserPrompt | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const prompt: UserPrompt = {
      id: `${sessionId}-prompt-${Date.now()}`,
      sessionId,
      prompt: request.prompt,
      timestamp: Date.now(),
    };

    // 获取或创建该会话的提问历史
    let prompts = this.prompts.get(sessionId) || [];
    prompts.unshift(prompt);

    // 保留最近 N 条
    if (prompts.length > this.MAX_PROMPTS_PER_SESSION) {
      prompts = prompts.slice(0, this.MAX_PROMPTS_PER_SESSION);
    }
    this.prompts.set(sessionId, prompts);

    // 更新会话的当前提问
    session.updatedAt = Date.now();

    return prompt;
  }

  /**
   * 获取会话的提问历史
   */
  getPrompts(sessionId: number): UserPrompt[] {
    return this.prompts.get(sessionId) || [];
  }

  // ========== 增强功能：工具调用记录 ==========

  /**
   * 开始工具调用
   */
  startToolCall(sessionId: number, request: ToolStartRequest): ToolCall | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const toolCall: ToolCall = {
      id: `${sessionId}-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      tool: request.tool,
      input: request.input,
      status: 'pending',
      startedAt: Date.now(),
    };

    // 保存到待完成列表
    this.pendingTools.set(toolCall.id, toolCall);

    // 添加到会话的工具调用历史
    let toolCalls = this.toolCalls.get(sessionId) || [];
    toolCalls.unshift(toolCall);

    // 保留最近 N 条
    if (toolCalls.length > this.MAX_TOOL_CALLS_PER_SESSION) {
      toolCalls = toolCalls.slice(0, this.MAX_TOOL_CALLS_PER_SESSION);
    }
    this.toolCalls.set(sessionId, toolCalls);

    session.updatedAt = Date.now();

    return toolCall;
  }

  /**
   * 结束工具调用
   */
  endToolCall(toolCallId: string, request: ToolEndRequest): ToolCall | undefined {
    const toolCall = this.pendingTools.get(toolCallId);
    if (!toolCall) return undefined;

    // 更新状态
    toolCall.status = request.success ? 'success' : 'error';
    toolCall.completedAt = Date.now();
    toolCall.duration = toolCall.completedAt - toolCall.startedAt;
    if (request.error) {
      toolCall.error = request.error;
    }

    // 从待完成列表移除
    this.pendingTools.delete(toolCallId);

    // 更新会话历史中的记录
    const sessionTools = this.toolCalls.get(toolCall.sessionId);
    if (sessionTools) {
      const index = sessionTools.findIndex(t => t.id === toolCallId);
      if (index !== -1) {
        sessionTools[index] = toolCall;
      }
    }

    return toolCall;
  }

  /**
   * 获取会话的工具调用历史
   */
  getToolCalls(sessionId: number): ToolCall[] {
    return this.toolCalls.get(sessionId) || [];
  }

  /**
   * 获取会话的工具调用统计
   */
  getToolStats(sessionId: number): ToolStats {
    const toolCalls = this.toolCalls.get(sessionId) || [];
    const byTool: Record<string, number> = {};

    for (const tc of toolCalls) {
      byTool[tc.tool] = (byTool[tc.tool] || 0) + 1;
    }

    return {
      totalCalls: toolCalls.length,
      byTool,
    };
  }

  /**
   * 获取增强版会话信息（包含历史记录）
   */
  getWithHistory(pid: number) {
    const session = this.sessions.get(pid);
    if (!session) return undefined;

    return {
      ...session,
      promptHistory: this.getPrompts(pid),
      toolHistory: this.getToolCalls(pid),
      toolStats: this.getToolStats(pid),
    };
  }

  // ========== 事件记录 ==========

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

  /**
   * 从路径提取项目名称
   */
  private extractProjectName(cwd: string): string {
    const parts = cwd.split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * 标准化终端类型
   */
  private normalizeTerminal(terminal: string): Session['terminal'] {
    const terminalMap: Record<string, Session['terminal']> = {
      'vscode': 'vscode',
      'iTerm.app': 'iterm',
      'iTerm': 'iterm',
      'WarpTerminal': 'warp',
      'Warp': 'warp',
      'Apple_Terminal': 'terminal',
      'Terminal': 'terminal',
    };

    return terminalMap[terminal] || 'unknown';
  }
}

// 单例导出
export const sessionStore = new SessionStore();
