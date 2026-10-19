import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectDenied } from './support/fixtures.js';

type AuditRow = {
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  organization_id: string;
  changes: Record<string, unknown>;
};

const AUDIT_BY_ORG = `
  query AuditByOrg($orgId: uuid!) {
    audit_log(where: { organization_id: { _eq: $orgId } }, order_by: { occurred_at: asc }) {
      user_id action entity entity_id organization_id changes
    }
  }
`;

const ADMIN_AUDIT = `
  query AdminAudit($orgId: uuid!, $entity: String!) {
    audit_log(where: { organization_id: { _eq: $orgId }, entity: { _eq: $entity } }) { action changes }
  }
`;

const RENAME_ORG = `
  mutation Rename($id: uuid!, $name: String!) {
    update_organizations(where: { id: { _eq: $id } }, _set: { name: $name }) { affected_rows }
  }
`;

describe('audit log', () => {
  it('should record an organization update with user, action and changed columns only', async () => {
    const { orgA, user } = await createTwoOrgs();
    await asOrgAdmin(user.id, orgA.id).request(RENAME_ORG, { id: orgA.id, name: 'Renamed' });

    const data = await asOrgAdmin(user.id, orgA.id).request<{ audit_log: AuditRow[] }>(AUDIT_BY_ORG, {
      orgId: orgA.id,
    });
    const updates = data.audit_log.filter((r) => r.entity === 'organizations' && r.action === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      user_id: user.id,
      entity_id: orgA.id,
      organization_id: orgA.id,
      changes: { name: { old: orgA.name, new: 'Renamed' } },
    });
    expect(Object.keys(updates[0].changes)).toEqual(['name']);
  });

  it('should hide one organization audit rows from another organization admin', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    await asOrgAdmin(user.id, orgA.id).request(RENAME_ORG, { id: orgA.id, name: 'Only A' });

    const asB = await asOrgAdmin(other.id, orgB.id).request<{ audit_log: AuditRow[] }>(AUDIT_BY_ORG, {
      orgId: orgA.id,
    });
    expect(asB.audit_log).toEqual([]);
    const own = await asOrgAdmin(other.id, orgB.id).request<{ audit_log: AuditRow[] }>(AUDIT_BY_ORG, {
      orgId: orgB.id,
    });
    expect(own.audit_log.length).toBeGreaterThan(0);
  });

  it('should expose no audit_log mutations to org admins', async () => {
    const { orgA, user } = await createTwoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);
    await expectDenied(
      client.request(`mutation { insert_audit_log_one(object: { organization_id: "${orgA.id}", entity: "x", action: insert }) { id } }`),
      'insert_audit_log_one',
    );
    await expectDenied(
      client.request(`mutation { update_audit_log(where: {}, _set: { entity: "y" }) { affected_rows } }`),
      'update_audit_log',
    );
    await expectDenied(client.request(`mutation { delete_audit_log(where: {}) { affected_rows } }`), 'delete_audit_log');
  });

  it('should write no audit row for an update touching only an ignored or updated_at column', async () => {
    const { orgA, user } = await createTwoOrgs();
    const before = await asAdmin().request<{ audit_log: AuditRow[] }>(ADMIN_AUDIT, {
      orgId: orgA.id,
      entity: 'organization_members',
    });
    await asAdmin().request(
      `mutation($u: uuid!) { update_organization_members(where: { user_id: { _eq: $u } }, _set: { updated_at: "2030-01-01T00:00:00Z" }) { affected_rows } }`,
      { u: user.id },
    );
    const after = await asAdmin().request<{ audit_log: AuditRow[] }>(ADMIN_AUDIT, {
      orgId: orgA.id,
      entity: 'organization_members',
    });
    expect(after.audit_log).toHaveLength(before.audit_log.length);
  });

  it('should record a null user_id for admin-secret changes without a user', async () => {
    const { orgA, user } = await createTwoOrgs();
    await asAdmin().request(
      `mutation($u: uuid!) { update_organization_members(where: { user_id: { _eq: $u } }, _set: { title: "Chief" }) { affected_rows } }`,
      { u: user.id },
    );
    const data = await asAdmin().request<{ audit_log: AuditRow[] }>(AUDIT_BY_ORG, { orgId: orgA.id });
    const row = data.audit_log.find(
      (r) => r.entity === 'organization_members' && r.action === 'update' && 'title' in r.changes,
    );
    expect(row?.user_id).toBeNull();
    expect(row?.changes).toEqual({ title: { old: null, new: 'Chief' } });
  });

  it('should keep audit rows and succeed when the organization is deleted with members', async () => {
    const { orgA } = await createTwoOrgs();
    await asAdmin().request(`mutation($id: uuid!) { delete_organizations(where: { id: { _eq: $id } }) { affected_rows } }`, {
      id: orgA.id,
    });
    const data = await asAdmin().request<{ audit_log: AuditRow[] }>(AUDIT_BY_ORG, { orgId: orgA.id });
    expect(data.audit_log.some((r) => r.entity === 'organizations' && r.action === 'insert')).toBe(true);
    expect(data.audit_log.some((r) => r.entity === 'organization_members')).toBe(true);
    expect(data.audit_log.some((r) => r.action === 'delete' && r.entity === 'organization_members')).toBe(false);
  });
});
