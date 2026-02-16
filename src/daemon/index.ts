// src/daemon/index.ts
import { createServer } from './server.js';
import { DEFAULT_CONFIG } from '../types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_CONFIG.port;

const app = createServer();

const server = app.listen(PORT, () => {
  console.log(`Claude Monitor Daemon started on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
