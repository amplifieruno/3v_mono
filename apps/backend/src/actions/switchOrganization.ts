import { z } from 'zod';
import { signOrgToken } from '../auth/hasuraJwt.js';
import { ActionError, defineAction } from './types.js';

export type OrgToken = {
  access_token: string;
  expires_at: string;
  organization_id: string;
  role: string;
};

type Membership = {
  role: string;
  status: string;
  expires_at: string | null;
  organization: { status: string } | null;
};

const MEMBERSHIP_QUERY = `
  query SwitchOrgMembership($org: uuid!, $user: uuid!) {
    organization_members(where: { organization_id: { _eq: $org }, user_id: { _eq: $user } }, limit: 1) {
      role
      status
      expires_at
      organization { status }
    }
    user(id: $user) { disabled }
  }
`;

const RECORD_SWITCH = `
  mutation RecordSwitchOrg($user: uuid!, $org: uuid!) {
    insert_user_settings_one(
      object: { user_id: $user, last_organization_id: $org }
      on_conflict: { constraint: user_settings_pkey, update_columns: [last_organization_id] }
    ) { user_id }
    insert_audit_log_one(
      object: { organization_id: $org, user_id: $user, action: switch_org, entity: "organizations", entity_id: $org }
    ) { id }
  }
`;

/** Membership role → Hasura role in the organization token. */
const TOKEN_ROLES: Record<string, 'org_admin'> = { admin: 'org_admin' };

const inputSchema = z.object({ organization_id: z.string().uuid() });

/**
 * Checks the caller's active membership in the organization and returns a short-lived
 * organization token (§4.3). Records `user_settings.last_organization_id` and an audit row.
 */
export const switchOrganization = defineAction(inputSchema, async ({ env, input, session, admin, actor }): Promise<OrgToken> => {
  const userId = session.userId;
  if (!userId) throw new ActionError('unauthenticated', 'x-hasura-user-id is required');
  const organizationId = input.organization_id.toLowerCase();

  const { organization_members, user } = await admin.request<{
    organization_members: Membership[];
    user: { disabled: boolean } | null;
  }>(MEMBERSHIP_QUERY, { org: organizationId, user: userId });
  // A base token outlives sign-out/disable until it expires; never mint an org token for a disabled account.
  if (!user || user.disabled) throw new ActionError('account_disabled', 'This account is disabled');
  const membership = organization_members[0];
  if (!membership) throw new ActionError('not_a_member', 'You are not a member of this organization');

  const expired = membership.expires_at !== null && new Date(membership.expires_at).getTime() <= Date.now();
  if (membership.status !== 'active' || expired) {
    throw new ActionError('membership_inactive', 'Your membership in this organization is not active');
  }
  if (membership.organization?.status !== 'active') {
    throw new ActionError('organization_suspended', 'This organization is suspended');
  }

  const role = TOKEN_ROLES[membership.role];
  if (!role) throw new ActionError('unsupported_role', `Membership role ${membership.role} cannot sign in`);

  await actor.request(RECORD_SWITCH, { user: userId, org: organizationId });

  const { token, expiresAt } = signOrgToken(
    { userId, organizationId, role, ttlSeconds: env.ORG_TOKEN_TTL_SECONDS },
    env.HASURA_JWT_SECRET,
  );
  return { access_token: token, expires_at: expiresAt.toISOString(), organization_id: organizationId, role };
});
