import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HasuraError } from '../hasura/client.js';
import { ActionError, defineAction } from './types.js';

export type InvitationOutput = { invitation_id: string; token: string; expires_at: string };
export type AcceptedInvitationOutput = { organization_id: string };

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLES = ['admin'] as const;

const EXPIRE_STALE = `
  mutation ExpireStaleInvitations($org: uuid!, $email: citext!, $now: timestamptz!) {
    update_organization_invitations(
      where: { organization_id: { _eq: $org }, email: { _eq: $email }, status: { _eq: pending }, expires_at: { _lte: $now } }
      _set: { status: expired }
    ) { affected_rows }
  }
`;

/** An active, unexpired membership (an expired one may be renewed by a new invitation). */
const ACTIVE_MEMBER = `
  query InviteActiveMember($org: uuid!, $email: citext!, $now: timestamptz!) {
    organization_members(
      where: {
        organization_id: { _eq: $org }
        status: { _eq: active }
        _or: [{ expires_at: { _is_null: true } }, { expires_at: { _gt: $now } }]
        user: { email: { _eq: $email } }
      }
      limit: 1
    ) { id }
  }
`;

const CALLER_EMAIL = `
  query AcceptCallerEmail($user: uuid!) {
    users(where: { id: { _eq: $user } }, limit: 1) { email }
  }
`;

/** Atomic claim-first acceptance (itap.accept_invitation, tracked as claim_invitation, admin only). */
const CLAIM_INVITATION = `
  mutation ClaimInvitation($hash: String!, $user: uuid!, $email: citext!) {
    claim_invitation(args: { p_token_hash: $hash, p_user_id: $user, p_email: $email }) { organization_id }
  }
`;

const CREATE_INVITATION = `
  mutation CreateInvitation($object: organization_invitations_insert_input!) {
    insert_organization_invitations_one(object: $object) { id expires_at }
  }
`;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof HasuraError && error.code === 'constraint-violation' && /unique/i.test(error.message);
}

/** "Sends" the invitation email: a structured log line (no mail transport in the demo). */
function logInvitationEmail(fields: { to: string; organization_id: string; invitation_id: string; token: string }): void {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'invitation_email', ...fields })}\n`);
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Hasura forwards an omitted argument as null.
  role: z.enum(ROLES).nullish().transform((r) => r ?? 'admin'),
});

/** Creates a pending invitation (org_admin) and returns the plaintext token exactly once. */
export const inviteMember = defineAction(inviteSchema, async ({ input, session, admin, actor }): Promise<InvitationOutput> => {
  const { userId, organizationId } = session;
  if (!userId || !organizationId) throw new ActionError('unauthenticated', 'An organization session is required');

  const now = new Date();
  const active = await admin.request<{ organization_members: { id: string }[] }>(ACTIVE_MEMBER, {
    org: organizationId,
    email: input.email,
    now: now.toISOString(),
  });
  if (active.organization_members.length > 0) {
    throw new ActionError('already_member', 'This person is already an active member');
  }

  // A lapsed pending invitation would otherwise block re-inviting through the partial unique index.
  await actor.request(EXPIRE_STALE, { org: organizationId, email: input.email, now: now.toISOString() });

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  let created: { id: string; expires_at: string } | null;
  try {
    const data = await actor.request<{ insert_organization_invitations_one: { id: string; expires_at: string } | null }>(
      CREATE_INVITATION,
      {
        object: {
          organization_id: organizationId,
          email: input.email,
          role: input.role,
          token_hash: hashToken(token),
          expires_at: expiresAt.toISOString(),
          invited_by: userId,
        },
      },
    );
    created = data.insert_organization_invitations_one;
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new ActionError('already_invited', 'A pending invitation already exists for this email');
    throw error;
  }
  if (!created) throw new Error('invite_member: insert returned no row');

  logInvitationEmail({ to: input.email, organization_id: organizationId, invitation_id: created.id, token });
  return { invitation_id: created.id, token, expires_at: expiresAt.toISOString() };
});

const acceptSchema = z.object({ token: z.string().min(1).max(256) });

const CLAIM_ERRORS = new Set([
  'invitation_not_found',
  'invitation_not_pending',
  'invitation_expired',
  'email_mismatch',
  'already_member',
]);

const CLAIM_MESSAGES: Record<string, string> = {
  invitation_not_found: 'Invitation not found',
  invitation_not_pending: 'This invitation is no longer pending',
  invitation_expired: 'This invitation has expired',
  email_mismatch: 'This invitation was sent to a different email address',
  already_member: 'You are already an active member of this organization',
};

/** Accepts an invitation as the signed-in user whose account email matches; creates or reactivates the membership. */
export const acceptInvitation = defineAction(
  acceptSchema,
  async ({ input, session, admin, actor }): Promise<AcceptedInvitationOutput> => {
    const userId = session.userId;
    if (!userId) throw new ActionError('unauthenticated', 'x-hasura-user-id is required');

    const { users } = await admin.request<{ users: { email: string }[] }>(CALLER_EMAIL, { user: userId });
    const email = users[0]?.email;
    if (!email) throw new ActionError('email_mismatch', CLAIM_MESSAGES.email_mismatch);

    try {
      const data = await actor.request<{ claim_invitation: { organization_id: string }[] }>(CLAIM_INVITATION, {
        hash: hashToken(input.token),
        user: userId,
        email,
      });
      const claimed = data.claim_invitation[0];
      if (!claimed) throw new Error('accept_invitation: claim returned no row');
      return { organization_id: claimed.organization_id };
    } catch (error: unknown) {
      const code = error instanceof HasuraError ? [...CLAIM_ERRORS].find((c) => (error.detail ?? '').includes(c)) : undefined;
      if (code) throw new ActionError(code, CLAIM_MESSAGES[code]);
      throw error;
    }
  },
);
