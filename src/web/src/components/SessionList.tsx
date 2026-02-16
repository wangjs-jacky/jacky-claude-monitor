import { Play, Pause, Terminal, Trash2 } from 'lucide-react';
import type { Session } from '../types';

interface SessionListProps {
  sessions: Session[];
  onKill: (pid: number) => void;
}

export function SessionList({ sessions, onKill }: SessionListProps) {
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
