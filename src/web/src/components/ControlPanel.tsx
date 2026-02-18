import { Activity, Wifi, WifiOff } from 'lucide-react';
import type { Session, SessionStatus } from '../types';

interface ControlPanelProps {
  sessions: Session[];
  connected: boolean;
  port: number;
}

export function ControlPanel({ sessions, connected, port }: ControlPanelProps) {
  // 统计活跃会话（思考中或执行中）
  const activeCount = sessions.filter((s) => s.status === 'thinking' || s.status === 'executing').length;
  // 统计等待输入的会话
  const waitingCount = sessions.filter((s) => s.status === 'waiting_input').length;

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Claude Monitor
          </h1>

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              {connected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              {connected ? '已连接' : '未连接'}
            </span>

            <span className="text-gray-400">|</span>

            <span>端口: {port}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            活跃: {activeCount}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            等待: {waitingCount}
          </span>
        </div>
      </div>
    </div>
  );
}
