import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import type { Env } from './config/env.js';
import { actionsRouter } from './actions/router.js';

/**
 * Base Express app: shared middleware, health check and the Hasura Actions webhook.
 * Has no TypeORM/DB dependency, so tests (and Hasura) can reach actions without the legacy stack.
 */
export function createApp(env: Env): Express {
  const app = express();
  const nodeEnv = process.env.NODE_ENV || 'development';

  app.use(helmet());
  app.use(compression());
  // Mounted before the global body parser: the router checks x-action-secret before parsing.
  app.use('/hasura/actions', actionsRouter(env));
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  if (nodeEnv !== 'test') app.use(morgan(nodeEnv === 'development' ? 'dev' : 'combined'));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: nodeEnv,
    });
  });

  return app;
}
