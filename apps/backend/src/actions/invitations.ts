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

const ACTIVE_MEMBER = `
  query InviteActiveMember($org: uuid!, $email: citext!) {
    organization_members(
      where: { organization_id: { _eq: $org }, status: { _eq: active }, user: { email: { _eq: $email } } }
      limit: 1
    ) { id }
  }
`;

const CREATE_INVITATION = `
  mutation CreateInvitation($object: organization_invitations_insert_input!) {
    insert_organization_invitations_one(object: $object) { id expires_at }
  }
`;

const FIND_BY_HASH = `
  query FindInvitation($hash: String!, $user: uuid!) {
    organization_invitations(where: { token_hash: { _eq: $hash } }, limit: 1) {
      id
      organization_id
      email
      role
      status
      expires_at
    }
    users(where: { id: { _eq: $user } }, limit: 1) { email }
  }
`;

const FIND_MEMBERSHIP = `
  query FindMembership($org: uuid!, $user: uuid!) {
    organization_members(where: { organization_id: { _eq: $org }, user_id: { _eq: $user } }, limit: 1) {
      id
      status
    }
  }
`;

const REACTIVATE_MEMBER = `
  mutation ReactivateMember($id: uuid!, $role: member_roles_enum!) {
    update_organization_members_by_pk(pk_columns: { id: $id }, _set: { status: active, role: $role }) { id }
  }
`;

const CREATE_MEMBER = `
  mutation CreateMember($org: uuid!, $user: uuid!, $role: member_roles_enum!) {
    insert_organization_members_one(object: { organization_id: $org, user_id: $user, role: $role }) { id }
  }
`;

const MARK_ACCEPTED = `
  mutation MarkAccepted($id: uuid!, $user: uuid!, $now: timestamptz!) {
    update_organization_invitations(
      where: { id: { _eq: $id }, status: { _eq: pending } }
      _set: { status: accepted, accepted_by: $user, accepted_at: $now }
    ) { affected_rows }
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
export const inviteMember = defineAction(inviteSchema, async ({ input, session, admin }): Promise<InvitationOutput> => {
  const { userId, organizationId } = session;
  if (!userId || !organizationId) throw new ActionError('unauthenticated', 'An organization session is required');

  const active = await admin.request<{ organization_members: { id: string }[] }>(ACTIVE_MEMBER, {
    org: organizationId,
    email: input.email,
  });
  if (active.organization_members.length > 0) {
    throw new ActionError('already_member', 'This person is already an active member');
  }

  const now = new Date();
  // A lapsed pending invitation would otherwise block re-inviting through the partial unique index.
  await admin.request(EXPIRE_STALE, { org: organizationId, email: input.email, now: now.toISOString() });

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  let created: { id: string; expires_at: string } | null;
  try {
    const data = await admin.request<{ insert_organization_invitations_one: { id: string; expires_at: string } | null }>(
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

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
};

/** Accepts an invitation as the signed-in user whose account email matches; creates or reactivates the membership. */
export const acceptInvitation = defineAction(
  acceptSchema,
  async ({ input, session, admin }): Promise<AcceptedInvitationOutput> => {
    const userId = session.userId;
    if (!userId) throw new ActionError('unauthenticated', 'x-hasura-user-id is required');

    const found = await admin.request<{ organization_invitations: InvitationRow[]; users: { email: string }[] }>(
      FIND_BY_HASH,
      { hash: hashToken(input.token), user: userId },
    );
    const invitation = found.organization_invitations[0];
    if (!invitation) throw new ActionError('invitation_not_found', 'Invitation not found');
    if (invitation.status !== 'pending') throw new ActionError('invitation_not_pending', 'This invitation is no longer pending');
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new ActionError('invitation_expired', 'This invitation has expired');
    }
    const callerEmail = found.users[0]?.email;
    if (!callerEmail || callerEmail.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ActionError('email_mismatch', 'This invitation was sent to a different email address');
    }

    const orgId = invitation.organization_id;
    const { organization_members } = await admin.request<{ organization_members: { id: string; status: string }[] }>(
      FIND_MEMBERSHIP,
      { org: orgId, user: userId },
    );
    const existing = organization_members[0];
    if (!existing) {
      await admin.request(CREATE_MEMBER, { org: orgId, user: userId, role: invitation.role });
    } else if (existing.status !== 'active') {
      await admin.request(REACTIVATE_MEMBER, { id: existing.id, role: invitation.role });
    }

    const marked = await admin.request<{ update_organization_invitations: { affected_rows: number } }>(MARK_ACCEPTED, {
      id: invitation.id,
      user: userId,
      now: new Date().toISOString(),
    });
    if (marked.update_organization_invitations.affected_rows === 0) {
      throw new ActionError('invitation_not_pending', 'This invitation is no longer pending');
    }
    return { organization_id: orgId };
  },
);
