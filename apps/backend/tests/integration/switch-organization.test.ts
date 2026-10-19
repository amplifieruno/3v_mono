import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asBearer, asUser, testEnv } from './support/clients.js';
import { addMember, createTestOrg, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { requireBackend } from './support/backend.js';

type OrgToken = { access_token: string; expires_at: string; organization_id: string; role: string };

const SWITCH = `
  mutation ($id: uuid!) {
    switch_organization(organization_id: $id) { access_token expires_at organization_id role }
  }
`;

function switchOrg(userId: string, orgId: string): Promise<{ switch_organization: OrgToken }> {
  return asUser(userId).request<{ switch_organization: OrgToken }>(SWITCH, { id: orgId });
}

beforeAll(requireBackend);

describe('switch_organization action', () => {
  it('should return an org token that scopes organizations to the chosen org', async () => {
    const { orgA, user } = await createTwoOrgs();
    const { switch_organization: token } = await switchOrg(user.id, orgA.id);

    expect(token.organization_id).toBe(orgA.id);
    expect(token.role).toBe('org_admin');
    expect(new Date(token.expires_at).getTime()).toBeGreaterThan(Date.now());

    const data = await asBearer(token.access_token).request<{ organizations: { id: string }[] }>(
      `query { organizations { id } }`,
    );
    expect(data.organizations).toEqual([{ id: orgA.id }]);
  });

  it('should reject a non-member with not_a_member', async () => {
    const { orgB, user } = await createTwoOrgs();
    const error = await expectError(switchOrg(user.id, orgB.id));
    expect(error.code).toBe('not_a_member');
  });

  it('should reject a deactivated member with membership_inactive', async () => {
    const [org, user] = await Promise.all([createTestOrg(), createTestUser()]);
    await addMember(org.id, user.id, 'deactivated');
    const error = await expectError(switchOrg(user.id, org.id));
    expect(error.code).toBe('membership_inactive');
  });

  it('should reject a member whose membership has expired with membership_inactive', async () => {
    const [org, user] = await Promise.all([createTestOrg(), createTestUser()]);
    const { id } = await addMember(org.id, user.id);
    await asAdmin().request(
      `mutation ($id: uuid!, $at: timestamptz!) { update_organization_members_by_pk(pk_columns: { id: $id }, _set: { expires_at: $at }) { id } }`,
      { id, at: new Date(Date.now() - 60_000).toISOString() },
    );
    const error = await expectError(switchOrg(user.id, org.id));
    expect(error.code).toBe('membership_inactive');
  });

  it('should reject a suspended organization with organization_suspended', async () => {
    const { orgA, user } = await createTwoOrgs();
    await asAdmin().request(
      `mutation ($id: uuid!) { update_organizations_by_pk(pk_columns: { id: $id }, _set: { status: suspended }) { id } }`,
      { id: orgA.id },
    );
    const error = await expectError(switchOrg(user.id, orgA.id));
    expect(error.code).toBe('organization_suspended');
  });

  it('should record last_organization_id and a switch_org audit row', async () => {
    const { orgA, user } = await createTwoOrgs();
    await switchOrg(user.id, orgA.id);

    const data = await asAdmin().request<{
      user_settings_by_pk: { last_organization_id: string | null } | null;
      audit_log: { user_id: string; entity: string; entity_id: string }[];
    }>(
      `query ($u: uuid!, $org: uuid!) {
        user_settings_by_pk(user_id: $u) { last_organization_id }
        audit_log(where: { organization_id: { _eq: $org }, action: { _eq: switch_org } }) { user_id entity entity_id }
      }`,
      { u: user.id, org: orgA.id },
    );
    expect(data.user_settings_by_pk?.last_organization_id).toBe(orgA.id);
    expect(data.audit_log).toEqual([{ user_id: user.id, entity: 'organization', entity_id: orgA.id }]);
  });

  it('should not let an org token renew itself (no switch_organization for org_admin, no user role)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const { switch_organization: token } = await switchOrg(user.id, orgA.id);

    await expectDenied(asBearer(token.access_token).request(SWITCH, { id: orgA.id }), 'switch_organization');

    const asUserRole = await fetch(testEnv().HASURA_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
        'x-hasura-role': 'user',
      },
      body: JSON.stringify({ query: SWITCH, variables: { id: orgA.id } }),
    });
    const body = (await asUserRole.json()) as { errors?: { extensions?: { code?: string } }[] };
    expect(body.errors?.[0]?.extensions?.code).toBe('access-denied');
  });

  it('should reject a disabled account with account_disabled', async () => {
    const { orgA, user } = await createTwoOrgs();
    await asAdmin().request(
      `mutation ($id: uuid!) { updateUser(pk_columns: { id: $id }, _set: { disabled: true }) { id } }`,
      { id: user.id },
    );
    const error = await expectError(switchOrg(user.id, orgA.id));
    expect(error.code).toBe('account_disabled');
  });
});
