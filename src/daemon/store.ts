// src/daemon/store.ts
import type { Session, RegisterSessionRequest, SessionStatus } from '../types.js';

/**
 * 会话存储管理器
 * 负责管理所有 Claude Code 会话的状态
 */
export class SessionStore {
  private sessions: Map<number, Session> = new Map();

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
      status: 'running',
      startedAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.pid, session);
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

    session.status = status;
    session.updatedAt = Date.now();
    if (message !== undefined) {
      session.message = message;
    }

    return session;
  }

  /**
   * 删除会话
   */
  delete(pid: number): boolean {
    return this.sessions.delete(pid);
  }

  /**
   * 获取活跃会话数量
   */
  get count(): number {
    return this.sessions.size;
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
