import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Hasura webhook authentication (actions, event and cron triggers): `x-action-secret` must equal ACTION_SECRET.
 * Mount before any body parser so unauthenticated bodies are never parsed.
 */
export function requireWebhookSecret(expected: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!secretMatches(req.header('x-action-secret'), expected)) {
      res.status(401).json({ message: 'Unauthorized', extensions: { code: 'unauthorized' } });
      return;
    }
    next();
  };
}
