import { Clock, Play, Square, Pause, RotateCcw, Skull } from 'lucide-react';
import type { SessionEvent } from '../types';

interface EventTimelineProps {
  events: SessionEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'started':
        return <Play className="w-4 h-4 text-green-400" />;
      case 'ended':
        return <Square className="w-4 h-4 text-gray-400" />;
      case 'waiting':
        return <Pause className="w-4 h-4 text-yellow-400" />;
      case 'resumed':
        return <RotateCcw className="w-4 h-4 text-blue-400" />;
      case 'killed':
        return <Skull className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      started: '会话开始',
      ended: '会话结束',
      waiting: '等待输入',
      resumed: '恢复运行',
      killed: '被终止',
    };
    return labels[type] || type;
  };

  if (events.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
        <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>暂无事件记录</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5" />
        事件历史 ({events.length})
      </h2>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-2 rounded hover:bg-gray-700 transition-colors"
          >
            <div className="mt-0.5">{getEventIcon(event.type)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{event.project}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {formatTime(event.timestamp)}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {getEventLabel(event.type)}
                {event.message && ` - ${event.message}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
