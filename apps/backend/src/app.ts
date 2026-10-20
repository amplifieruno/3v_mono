import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import type { Env } from './config/env.js';
import { actionsRouter } from './actions/router.js';
import { createAuthServiceDeps } from './auth-service/service.js';
import { authServiceRouter } from './auth-service/routes.js';
import { eventsRouter } from './events/router.js';
import { webhookSinkRouter } from './webhooks/sink.js';

/**
 * Base Express app: shared middleware, health check, the Hasura Actions / event and cron trigger webhooks and the
 * face authentication REST service (/v1/auth).
 */
export function createApp(env: Env): Express {
  const app = express();
  const nodeEnv = process.env.NODE_ENV || 'development';

  // One reverse proxy (traefik) in front: req.ip is the client address recorded on auth sessions.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  // Mounted before the global body parser: the routers check x-action-secret before parsing.
  app.use('/hasura/actions', actionsRouter(env));
  // Dev/test only: a webhook receiver (unauthenticated POST, secret-protected GET); absent unless enabled.
  if (env.WEBHOOK_SINK_ENABLED) app.use('/hasura/events/webhook-sink', webhookSinkRouter(env.ACTION_SECRET));
  app.use('/hasura/events', eventsRouter(env));
  // Face authentication service (key auth over the raw body; mounted before the JSON parser and without CORS).
  app.use('/v1/auth', authServiceRouter(createAuthServiceDeps(env)));
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  if (nodeEnv !== 'test') {
    app.use(morgan(nodeEnv === 'development' ? 'dev' : 'combined', { skip: (req) => req.url === '/health' }));
  }

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
