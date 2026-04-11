// src/daemon/index.ts
import { createServer as createHttpServer } from 'http';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getApp } from './server.js';
import { initWebSocket } from './websocket.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;
const SOCKET_PATH = join(process.env.HOME || '', '.claude-monitor', 'monitor.sock');

const app = getApp();

// ========== TCP Server（给 Dashboard/WebSocket 用） ==========
const tcpServer = createHttpServer(app);
initWebSocket(tcpServer);

tcpServer.listen(PORT, () => {
  console.log(`TCP server (Dashboard): http://localhost:${PORT}/dashboard`);
});

// ========== Unix Domain Socket Server（给 Hooks 用） ==========
// 清理残留的 socket 文件
if (existsSync(SOCKET_PATH)) {
  try {
    unlinkSync(SOCKET_PATH);
    console.log(`Cleaned up stale socket: ${SOCKET_PATH}`);
  } catch {
    // 可能是旧进程还在运行
  }
}

const udsServer = createHttpServer(app);
udsServer.listen(SOCKET_PATH, () => {
  console.log(`UDS server (Hooks): ${SOCKET_PATH}`);
  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

// ========== 优雅关闭 ==========
const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();

  // 关闭 UDS server 并删除 socket 文件
  udsServer.close(() => {
    try {
      if (existsSync(SOCKET_PATH)) {
        unlinkSync(SOCKET_PATH);
      }
    } catch {
      // 忽略清理错误
    }

    // 关闭 TCP server
    tcpServer.close(() => {
      console.log('All servers closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
