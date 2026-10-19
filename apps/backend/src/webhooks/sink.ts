import express, { Router, type Request, type Response } from 'express';
import { requireWebhookSecret } from '../hasura/webhookSecret.js';

export type SinkRequest = { at: string; path: string; status: number; headers: Record<string, string>; body: string };

const KEEP = 2000;

/**
 * Dev/test webhook receiver (mounted at /hasura/events/webhook-sink only when WEBHOOK_SINK_ENABLED=true):
 * `POST /` or `POST /:status` answers that status (default 200) and keeps the last 2000 requests in memory with their
 * headers and raw body; `GET /` (x-action-secret) lists them, so tests can verify signatures.
 */
export function webhookSinkRouter(actionSecret: string): Router {
  const router = Router();
  const received: SinkRequest[] = [];

  router.get('/', requireWebhookSecret(actionSecret), (_req: Request, res: Response) => {
    res.status(200).json({ requests: received });
  });

  router.post(['/', '/:status'], express.raw({ type: () => true, limit: '1mb' }), (req: Request, res: Response) => {
    const status = req.params.status === undefined ? 200 : Number(req.params.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      res.status(400).json({ ok: false, error: 'invalid_status' });
      return;
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[name] = value;
    }
    received.push({
      at: new Date().toISOString(),
      path: req.originalUrl,
      status,
      headers,
      body: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '',
    });
    if (received.length > KEEP) received.splice(0, received.length - KEEP);
    res.status(status).json({ ok: status < 300 });
  });

  return router;
}
