import { timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { createHasuraClient, type HasuraSession } from '../hasura/client.js';
import { deleteFile, openFile } from './files.js';
import { acceptInvitation, inviteMember } from './invitations.js';
import { switchOrganization } from './switchOrganization.js';
import { ActionError, type ActionHandler } from './types.js';

export { ActionError, defineAction, type ActionContext, type ActionHandler, type ActionPayload } from './types.js';

export const defaultActionHandlers: Record<string, ActionHandler<unknown, unknown>> = {
  switch_organization: switchOrganization,
  invite_member: inviteMember,
  accept_invitation: acceptInvitation,
  open_file: openFile,
  delete_file: deleteFile,
};

const payloadSchema = z.object({
  action: z.object({ name: z.string().min(1) }),
  input: z.unknown(),
  session_variables: z.record(z.string()),
});

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ message, extensions: { code } });
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionFrom(vars: Record<string, string>): HasuraSession | undefined {
  const lower = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k.toLowerCase(), v]));
  const role = lower['x-hasura-role'];
  if (!role) return undefined;
  const session: HasuraSession = { role };
  if (lower['x-hasura-user-id']) session.userId = lower['x-hasura-user-id'];
  if (lower['x-hasura-organization-id']) session.organizationId = lower['x-hasura-organization-id'];
  return session;
}

/** Hasura Actions webhook router: `POST /:name` with the standard action payload. */
export function actionsRouter(
  env: Env,
  handlers: Record<string, ActionHandler<unknown, unknown>> = defaultActionHandlers,
): Router {
  const router = Router();

  // Authenticate before the body is parsed.
  router.use((req: Request, res: Response, next) => {
    if (!secretMatches(req.header('x-action-secret'), env.ACTION_SECRET)) {
      sendError(res, 401, 'unauthorized', 'Unauthorized');
      return;
    }
    next();
  });
  router.use(express.json({ limit: '1mb' }));

  router.post('/:name', async (req: Request, res: Response) => {
    const name = req.params.name;
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!handler) {
      sendError(res, 404, 'not_found', `Unknown action: ${name}`);
      return;
    }
    const parsed = payloadSchema.safeParse(req.body);
    const session = parsed.success ? sessionFrom(parsed.data.session_variables) : undefined;
    if (!parsed.success || !session || parsed.data.action.name !== name) {
      sendError(res, 400, 'invalid_payload', 'Invalid action payload');
      return;
    }

    try {
      const output = await handler({
        env,
        input: parsed.data.input,
        session,
        admin: createHasuraClient(env),
        asCaller: createHasuraClient(env, session),
        actor: createHasuraClient(env, { ...session, role: 'admin' }),
      });
      res.status(200).json(output);
    } catch (error: unknown) {
      if (error instanceof ActionError) {
        sendError(res, 400, error.code, error.message);
        return;
      }
      console.error(`Action ${name} failed:`, error);
      sendError(res, 500, 'internal', 'Internal error');
    }
  });

  // Malformed JSON from an authenticated caller.
  router.use((error: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError) {
      sendError(res, 400, 'invalid_payload', 'Invalid JSON body');
      return;
    }
    next(error);
  });

  return router;
}
