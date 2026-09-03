import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { intelHealth } from './services/intel.service.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());
  if (!env.isProd) app.use(morgan('dev'));

  /** Health probe reports BOTH backends + the shared Atlas connection. */
  app.get('/health', async (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const fastapi = await intelHealth();
    res.json({
      service: 'agriqueue-express-api',
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      mongo: {
        state: states[mongoose.connection.readyState] || 'unknown',
        db: mongoose.connection.name,
      },
      fastapi,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'AgriQueue Core API',
      description: 'Smart slot booking, live token queue and procurement tracking for farmers',
      version: '1.0.0',
      docs: '/api/v1/meta',
      realtime: 'socket.io on the same origin',
      companionService: `${env.fastapiUrl}/docs (FastAPI analytics + ETA)`,
    });
  });

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
