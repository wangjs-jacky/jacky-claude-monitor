import { useEffect, useRef, useCallback, useState } from 'react';
import type { Session, SessionEvent, ServerMessage, ClientMessage } from '../types';

interface UseWebSocketReturn {
  sessions: Session[];
  events: SessionEvent[];
  connected: boolean;
  killSession: (pid: number) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'init':
        setSessions(msg.sessions);
        setEvents(msg.events);
        break;
      case 'session_update':
        setSessions((prev) => {
          const index = prev.findIndex((s) => s.pid === msg.session.pid);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = msg.session;
            return updated;
          }
          return [...prev, msg.session];
        });
        break;
      case 'session_removed':
        setSessions((prev) => prev.filter((s) => s.pid !== msg.pid));
        break;
      case 'new_event':
        setEvents((prev) => [msg.event, ...prev].slice(0, 100));
        break;
    }
  }, []);

  const killSession = useCallback((pid: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'kill_session', pid };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { sessions, events, connected, killSession };
}
