// src/daemon/index.ts
import { createServer } from './server.js';
import { initWebSocket, broadcast } from './websocket.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { sessionStore } from './store.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const httpServer = createServer();

// 初始化 WebSocket
initWebSocket(httpServer);

// 监听 store 变化并广播
const originalRegister = sessionStore.register.bind(sessionStore);
const originalUpdate = sessionStore.update.bind(sessionStore);
const originalDelete = sessionStore.delete.bind(sessionStore);

sessionStore.register = (req) => {
  const session = originalRegister(req);
  broadcast({ type: 'session_update', session });
  return session;
};

sessionStore.update = (pid, status, message) => {
  const session = originalUpdate(pid, status, message);
  if (session) {
    broadcast({ type: 'session_update', session });
  }
  return session;
};

sessionStore.delete = (pid) => {
  const result = originalDelete(pid);
  if (result) {
    broadcast({ type: 'session_removed', pid });
  }
  return result;
};

httpServer.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
