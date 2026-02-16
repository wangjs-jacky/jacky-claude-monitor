// src/daemon/index.ts
import { createServer } from './server.js';
import { startZombieChecker, stopZombieChecker } from './zombie.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const app = createServer();

const server = app.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);

  // 启动僵尸进程检测
  startZombieChecker(DEFAULT_CONFIG.checkInterval);
});

// 优雅关闭
const shutdown = () => {
  console.log('Shutting down gracefully...');
  stopZombieChecker();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
