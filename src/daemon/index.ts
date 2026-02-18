// src/daemon/index.ts
import { createServer } from './server.js';
import { initWebSocket } from './websocket.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const httpServer = createServer();

// 初始化 WebSocket
initWebSocket(httpServer);

// 注意：广播逻辑已在 server.ts 的 API 端点中处理，无需在此覆盖

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
