import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin, asUser } from './support/clients.js';
import {
  addMember,
  createTestOrg,
  createTestUser,
  createTwoOrgs as twoOrgs,
  expectDenied,
  expectError,
} from './support/fixtures.js';

type Row = { id: string };

describe('tenancy schema', () => {
  it('should create organization_settings with defaults when an organization is created', async () => {
    const org = await createTestOrg();
    const data = await asAdmin().request<{
      organization_settings_by_pk: { recognition_threshold: number; tracking_timeout_seconds: number } | null;
    }>(
      `query ($id: uuid!) { organization_settings_by_pk(organization_id: $id) { recognition_threshold tracking_timeout_seconds } }`,
      { id: org.id },
    );
    expect(data.organization_settings_by_pk).toEqual({ recognition_threshold: 0.5, tracking_timeout_seconds: 300 });
  });

  it('should scope org_admin reads of organizations and members to the token organization', async () => {
    const { orgA, orgB, user } = await twoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);

    const own = await client.request<{ organizations: Row[]; organization_members: { user_id: string }[] }>(
      `query ($id: uuid!) {
        organizations(where: { id: { _eq: $id } }) { id }
        organization_members(where: { organization_id: { _eq: $id } }) { user_id }
      }`,
      { id: orgA.id },
    );
    expect(own.organizations).toEqual([{ id: orgA.id }]);
    expect(own.organization_members).toEqual([{ user_id: user.id }]);

    const foreign = await client.request<{ organizations: Row[]; organization_members: Row[] }>(
      `query ($id: uuid!) {
        organizations(where: { id: { _eq: $id } }) { id }
        organization_members(where: { organization_id: { _eq: $id } }) { id }
      }`,
      { id: orgB.id },
    );
    expect(foreign).toEqual({ organizations: [], organization_members: [] });
  });

  it('should not let org_admin insert members directly (membership only via invitations)', async () => {
    const { orgA, user } = await twoOrgs();
    const newcomer = await createTestUser();
    const client = asOrgAdmin(user.id, orgA.id);

    await expectDenied(
      client.request(`mutation ($u: uuid!) { insert_organization_members_one(object: { user_id: $u }) { id } }`, {
        u: newcomer.id,
      }),
      'insert_organization_members_one',
    );
    await expectDenied(
      client.request(`mutation ($u: uuid!) { insert_organization_members(objects: [{ user_id: $u }]) { affected_rows } }`, {
        u: newcomer.id,
      }),
      'insert_organization_members',
    );
  });

  it('should let org_admin see the names and emails of its own members only', async () => {
    const { orgA, orgB, user, other } = await twoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);

    const members = await client.request<{ organization_members: { user: { id: string; email: string } | null }[] }>(
      `{ organization_members { user { id email displayName avatarUrl } } }`,
    );
    expect(members.organization_members.map((m) => m.user)).toEqual([
      expect.objectContaining({ id: user.id, email: user.email }),
    ]);

    const users = await client.request<{ users: { id: string }[] }>(
      `query ($ids: [uuid!]!) { users(where: { id: { _in: $ids } }) { id } }`,
      { ids: [user.id, other.id] },
    );
    expect(users.users).toEqual([{ id: user.id }]);
    expect(orgB.id).not.toBe(orgA.id);

    await expectDenied(client.request(`{ users { passwordHash } }`), 'passwordHash');
  });

  it('should let org_admin update only its own organization', async () => {
    const { orgA, orgB, user } = await twoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);
    const update = `mutation ($id: uuid!) {
      update_organizations(where: { id: { _eq: $id } }, _set: { legal_name: "Renamed LLC" }) { affected_rows }
    }`;

    const foreign = await client.request<{ update_organizations: { affected_rows: number } }>(update, { id: orgB.id });
    expect(foreign.update_organizations.affected_rows).toBe(0);
    const own = await client.request<{ update_organizations: { affected_rows: number } }>(update, { id: orgA.id });
    expect(own.update_organizations.affected_rows).toBe(1);
  });

  it('should list for role user only organizations with an active membership', async () => {
    const { orgA, orgB, user } = await twoOrgs();
    const orgC = await createTestOrg('Org C');
    await addMember(orgC.id, user.id, 'deactivated');

    const data = await asUser(user.id).request<{ organizations: Row[] }>(
      `query ($ids: [uuid!]!) { organizations(where: { id: { _in: $ids } }) { id } }`,
      { ids: [orgA.id, orgB.id, orgC.id] },
    );
    expect(data.organizations).toEqual([{ id: orgA.id }]);

    const members = await asUser(user.id).request<{ organization_members: { organization_id: string }[] }>(
      `{ organization_members(order_by: { status: asc }) { organization_id } }`,
    );
    expect(members.organization_members.map((m) => m.organization_id).sort()).toEqual([orgA.id, orgC.id].sort());
  });

  it('should not expose organization_settings to role user', async () => {
    const { user } = await twoOrgs();
    const error = await expectError(asUser(user.id).request(`{ organization_settings { organization_id } }`));
    expect(error.code).toBe('validation-failed');
    expect(error.message).toContain("field 'organization_settings' not found");
  });

  it('should let org_admin read and update its own organization_settings', async () => {
    const { orgA, orgB, user } = await twoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);
    const data = await client.request<{ update_organization_settings: { affected_rows: number } }>(
      `mutation { update_organization_settings(where: {}, _set: { recognition_threshold: 0.7 }) { affected_rows } }`,
    );
    expect(data.update_organization_settings.affected_rows).toBe(1);

    const rows = await asAdmin().request<{
      organization_settings: { organization_id: string; recognition_threshold: number }[];
    }>(
      `query ($ids: [uuid!]!) { organization_settings(where: { organization_id: { _in: $ids } }) { organization_id recognition_threshold } }`,
      { ids: [orgA.id, orgB.id] },
    );
    const byOrg = Object.fromEntries(
      rows.organization_settings.map((r) => [r.organization_id, r.recognition_threshold]),
    );
    expect(byOrg).toEqual({ [orgA.id]: 0.7, [orgB.id]: 0.5 });
  });

  it('should delete an organization with members, references and settings in one mutation', async () => {
    const { orgA, user } = await twoOrgs();
    const colleague = await createTestUser();
    await addMember(orgA.id, colleague.id);
    const admin = asAdmin();
    await admin.request(
      `mutation ($org: uuid!, $u: uuid!, $c: uuid!) {
        update_organization_members(
          where: { organization_id: { _eq: $org }, user_id: { _eq: $u } }
          _set: { vacation_delegate_user_id: $c, deactivated_by: $c }
        ) { affected_rows }
      }`,
      { org: orgA.id, u: user.id, c: colleague.id },
    );
    await admin.request(
      `mutation ($u: uuid!, $org: uuid!) { insert_user_settings_one(object: { user_id: $u, last_organization_id: $org }) { user_id } }`,
      { u: user.id, org: orgA.id },
    );

    const deleted = await admin.request<{ delete_organizations_by_pk: Row | null }>(
      `mutation ($id: uuid!) { delete_organizations_by_pk(id: $id) { id } }`,
      { id: orgA.id },
    );
    expect(deleted.delete_organizations_by_pk).toEqual({ id: orgA.id });

    const after = await admin.request<{
      organization_members: Row[];
      organization_settings_by_pk: unknown;
      user_settings_by_pk: { last_organization_id: string | null } | null;
    }>(
      `query ($org: uuid!, $u: uuid!) {
        organization_members(where: { organization_id: { _eq: $org } }) { id }
        organization_settings_by_pk(organization_id: $org) { organization_id }
        user_settings_by_pk(user_id: $u) { last_organization_id }
      }`,
      { org: orgA.id, u: user.id },
    );
    expect(after).toEqual({
      organization_members: [],
      organization_settings_by_pk: null,
      user_settings_by_pk: { last_organization_id: null },
    });
  });

  it('should let a user manage only their own user_settings', async () => {
    const user = await createTestUser();
    const client = asUser(user.id);
    const inserted = await client.request<{ insert_user_settings_one: { user_id: string; locale: string } }>(
      `mutation { insert_user_settings_one(object: { locale: "de", timezone: "Europe/Berlin" }) { user_id locale } }`,
    );
    expect(inserted.insert_user_settings_one).toEqual({ user_id: user.id, locale: 'de' });

    await expectDenied(
      client.request(
        `mutation ($o: uuid!) { update_user_settings(where: {}, _set: { last_organization_id: $o }) { affected_rows } }`,
        { o: user.id },
      ),
      'last_organization_id',
    );
    const stranger = await createTestUser();
    const seen = await asUser(stranger.id).request<{ user_settings: Row[] }>(`{ user_settings { user_id } }`);
    expect(seen.user_settings).toEqual([]);
  });
});
