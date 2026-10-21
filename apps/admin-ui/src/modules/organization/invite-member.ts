import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { schema } from '../../data/schema';
import { MEMBER_ROLES } from '../../enums/tenancy';

/** The registry key (`src/data/operations.ts`) the invitation operations are bound under. */
export const INVITATION_BINDING = 'organization_invitation';

export const inviteMemberInput = z.object({
  email: z.string().trim().email(),
  role: z.enum(MEMBER_ROLES),
});

export const inviteMemberOutput = z.object({
  invitation_id: z.string(),
  token: z.string(),
  expires_at: z.string(),
});

/**
 * The Hasura action `invite_member(email, role)`: creates a pending invitation
 * and answers its one-time token, which is never stored in plain text. The
 * new row refreshes every invitation read.
 */
export const inviteMember = defineMutation('itap:invite-member', {
  binding: { provider: 'hasura', resource: INVITATION_BINDING, operation: 'inviteMember' },
  input: schema(inviteMemberInput),
  output: schema(inviteMemberOutput),
  effects: [{ resource: INVITATION_BINDING }],
});
