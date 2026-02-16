// src/daemon/websocket.ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ServerMessage, ClientMessage } from '../types.js';
import { sessionStore } from './store.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/**
 * 初始化 WebSocket 服务器
 */
export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total: ${clients.size}`);

    // 发送初始化数据
    sendMessage(ws, {
      type: 'init',
      sessions: sessionStore.getAll(),
      events: sessionStore.getEvents(),
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total: ${clients.size}`);
    });
  });
}

/**
 * 广播消息给所有客户端
 */
export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * 发送消息给单个客户端
 */
function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 处理客户端消息
 */
function handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'kill_session':
      // 删除会话
      const session = sessionStore.get(msg.pid);
      if (session) {
        sessionStore.addEvent('killed', session);
        sessionStore.delete(msg.pid);
        broadcast({ type: 'session_removed', pid: msg.pid });
      }
      break;
  }
}
