import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';
import { MEMBER_ROLES } from '../../enums/tenancy';

/** The registry key the invitation operations are bound under (the invitation resource's binding). */
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

/** The `invite_member` action (`org_admin`): answers the one-time token once. */
export const inviteMemberOperation = hasuraOperation(INVITATION_BINDING, 'inviteMember', {
  kind: 'mutation',
  document: `mutation InviteMember($email: String!, $role: String!) {
  invite_member(email: $email, role: $role) { invitation_id token expires_at }
}`,
  variables: (input) => {
    const { email, role } = input as { email: string; role: string };
    return { email, role };
  },
  mapResult: (data) => rootOf(data, 'invite_member'),
});

/**
 * The Hasura action `invite_member(email, role)`: creates a pending invitation
 * and answers its one-time token, which is never stored in plain text. The
 * new row refreshes every invitation read.
 */
export const inviteMember = defineMutation('itap:invite-member', {
  binding: inviteMemberOperation.binding,
  input: schema(inviteMemberInput),
  output: schema(inviteMemberOutput),
  effects: [{ resource: INVITATION_BINDING }],
});
