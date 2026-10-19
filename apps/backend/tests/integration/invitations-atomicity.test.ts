import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin, asUser } from './support/clients.js';
import { addMember, expectDenied, expectError } from './support/fixtures.js';
import { ACCEPT, invite, setup } from './support/invitations.js';
import { requireBackend } from './support/backend.js';

beforeAll(requireBackend);

const MEMBER_COUNT = `query ($o: uuid!, $u: uuid!) { organization_members_aggregate(where: { organization_id: { _eq: $o }, user_id: { _eq: $u } }) { aggregate { count } } }`;

async function memberCount(orgId: string, userId: string): Promise<number> {
  const data = await asAdmin().request<{ organization_members_aggregate: { aggregate: { count: number } } }>(
    MEMBER_COUNT,
    { o: orgId, u: userId },
  );
  return data.organization_members_aggregate.aggregate.count;
}

describe('invitation atomicity, audit actor and permissions', () => {
  it('should leave no membership when a revoked invitation is accepted', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    await asOrgAdmin(admin.id, org.id).request(
      `mutation ($id: uuid!) { update_organization_invitations_by_pk(pk_columns: { id: $id }, _set: { status: revoked }) { id } }`,
      { id: inv.invitation_id },
    );
    const error = await expectError(asUser(invitee.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('invitation_not_pending');
    expect(await memberCount(org.id, invitee.id)).toBe(0);
  });

  it('should create exactly one membership when the same token is accepted twice concurrently', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    const results = await Promise.allSettled([
      asUser(invitee.id).request(ACCEPT, { token: inv.token }),
      asUser(invitee.id).request(ACCEPT, { token: inv.token }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as { code: string }).code).toBe('invitation_not_pending');
    expect(await memberCount(org.id, invitee.id)).toBe(1);
  });

  it('should reject accepting when the user is already an active member and keep the invitation pending', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    await addMember(org.id, invitee.id);
    const error = await expectError(asUser(invitee.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('already_member');
    const { organization_invitations: rows } = await asAdmin().request<{ organization_invitations: { status: string }[] }>(
      `query ($id: uuid!) { organization_invitations(where: { id: { _eq: $id } }) { status } }`,
      { id: inv.invitation_id },
    );
    expect(rows[0].status).toBe('pending');
  });

  it('should record the caller as audit user for invite and accept', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });

    const { audit_log } = await asAdmin().request<{ audit_log: { action: string; entity: string; user_id: string | null }[] }>(
      `query ($o: uuid!) { audit_log(where: { organization_id: { _eq: $o }, entity: { _in: ["organization_invitations", "organization_members"] } }, order_by: { occurred_at: asc }) { action entity user_id } }`,
      { o: org.id },
    );
    const forEntity = (entity: string, action: string) =>
      audit_log.filter((r) => r.entity === entity && r.action === action).map((r) => r.user_id);
    expect(forEntity('organization_invitations', 'insert')).toEqual([admin.id]);
    expect(forEntity('organization_invitations', 'update')).toEqual([invitee.id]);
    expect(forEntity('organization_members', 'insert')).toContain(invitee.id);
  });

  it('should not let org_admin delete invitations or call the claim function', async () => {
    const { org, admin } = await setup();
    const inv = await invite(admin.id, org.id, 'keep@itap.test');
    const client = asOrgAdmin(admin.id, org.id);
    await expectDenied(
      client.request(`mutation ($id: uuid!) { delete_organization_invitations_by_pk(id: $id) { id } }`, {
        id: inv.invitation_id,
      }),
      'delete_organization_invitations_by_pk',
    );
    await expectDenied(
      client.request(
        `mutation { claim_invitation(args: { p_token_hash: "x", p_user_id: "${admin.id}", p_email: "a@b.co" }) { id } }`,
      ),
      'claim_invitation',
    );
  });
});
