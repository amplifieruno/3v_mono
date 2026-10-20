import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { createHasuraClient, type HasuraSession } from '../hasura/client.js';
import { requireWebhookSecret } from '../hasura/webhookSecret.js';
import { addIdentityPhotos, createIdentityFromPhotos, enrollFace } from './enrollment.js';
import { authenticateFace, rotateClientKey } from './faceAuth.js';
import { deleteFile, openFile } from './files.js';
import { acceptInvitation, inviteMember } from './invitations.js';
import { uploadProfileDocument } from './profileDocuments.js';
import { publishPolicyToTerminals } from './publishPolicy.js';
import { recognitionStart, recognitionStatus, recognitionStop } from './recognition.js';
import { searchFaces } from './search.js';
import { evaluateSegmentAction, previewSegmentAction } from './segments.js';
import { switchOrganization } from './switchOrganization.js';
import { ActionError, type ActionHandler } from './types.js';

export { ActionError, defineAction, type ActionContext, type ActionHandler, type ActionPayload } from './types.js';

export const defaultActionHandlers: Record<string, ActionHandler<unknown, unknown>> = {
  switch_organization: switchOrganization,
  invite_member: inviteMember,
  accept_invitation: acceptInvitation,
  open_file: openFile,
  delete_file: deleteFile,
  upload_profile_document: uploadProfileDocument,
  enroll_face: enrollFace,
  create_identity_from_photos: createIdentityFromPhotos,
  add_identity_photos: addIdentityPhotos,
  recognition_start: recognitionStart,
  recognition_stop: recognitionStop,
  recognition_status: recognitionStatus,
  preview_segment: previewSegmentAction,
  evaluate_segment: evaluateSegmentAction,
  search_faces: searchFaces,
  publish_policy_to_terminals: publishPolicyToTerminals,
  rotate_client_key: rotateClientKey,
  authenticate_face: authenticateFace,
};

const payloadSchema = z.object({
  action: z.object({ name: z.string().min(1) }),
  input: z.unknown(),
  session_variables: z.record(z.string()),
});

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ message, extensions: { code } });
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
  router.use(requireWebhookSecret(env.ACTION_SECRET));
  // upload_profile_document carries up to 10 MB of base64 (~13.4 MB) in the payload.
  router.use(express.json({ limit: '16mb' }));

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
