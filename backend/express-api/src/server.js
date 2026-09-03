import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './services/socket.service.js';
import { startQueueWatcher } from './services/watcher.service.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  startQueueWatcher();

  server.listen(env.port, () => {
    logger.success(`Express API  → http://localhost:${env.port}`);
    logger.info(`Health check → http://localhost:${env.port}/health`);
    logger.info(`FastAPI docs → ${env.fastapiUrl}/docs`);
    logger.info(`CORS origin  → ${env.clientOrigin.join(', ')}`);
  });

  const shutdown = async (signal) => {
    logger.warn(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.message}`));
}

bootstrap();
