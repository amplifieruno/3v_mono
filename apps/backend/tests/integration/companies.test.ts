import { describe, expect, it } from 'vitest';
import { asOrgAdmin, asUser } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';

const INSERT_COMPANY = `
  mutation InsertCompany($object: companies_insert_input!) {
    insert_companies_one(object: $object) { id name kind status organization_id }
  }
`;
const LIST_COMPANIES = `query { companies(order_by: { name: asc }) { id name kind status suite } }`;
const UPDATE_COMPANY = `
  mutation UpdateCompany($id: uuid!, $name: String!) {
    update_companies(where: { id: { _eq: $id } }, _set: { name: $name }) { affected_rows }
  }
`;
const DELETE_COMPANY = `
  mutation DeleteCompany($id: uuid!) { delete_companies(where: { id: { _eq: $id } }) { affected_rows } }
`;
const AUDIT = `
  query Audit($orgId: uuid!, $entityId: uuid!) {
    audit_log(where: { organization_id: { _eq: $orgId }, entity: { _eq: "companies" }, entity_id: { _eq: $entityId } }) {
      action changes
    }
  }
`;

type Company = { id: string; name: string; kind: string; status: string; organization_id: string };

describe('companies', () => {
  it('should let an org_admin create, read, update and delete a company with defaults', async () => {
    const { orgA, user } = await createTwoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);
    const created = await client.request<{ insert_companies_one: Company }>(INSERT_COMPANY, {
      object: { name: 'Acme', suite: '12B', cost_center: 'CC-1' },
    });
    expect(created.insert_companies_one).toMatchObject({ name: 'Acme', kind: 'tenant', status: 'active', organization_id: orgA.id });
    const id = created.insert_companies_one.id;

    const upd = await client.request<{ update_companies: { affected_rows: number } }>(UPDATE_COMPANY, { id, name: 'Acme Ltd' });
    expect(upd.update_companies.affected_rows).toBe(1);
    const list = await client.request<{ companies: { name: string }[] }>(LIST_COMPANIES);
    expect(list.companies.map((c) => c.name)).toEqual(['Acme Ltd']);

    const del = await client.request<{ delete_companies: { affected_rows: number } }>(DELETE_COMPANY, { id });
    expect(del.delete_companies.affected_rows).toBe(1);
  });

  it('should isolate companies per organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    const created = await a.request<{ insert_companies_one: Company }>(INSERT_COMPANY, { object: { name: 'A only' } });
    const id = created.insert_companies_one.id;

    expect((await b.request<{ companies: unknown[] }>(LIST_COMPANIES)).companies).toEqual([]);
    expect((await b.request<{ update_companies: { affected_rows: number } }>(UPDATE_COMPANY, { id, name: 'hijack' })).update_companies.affected_rows).toBe(0);
    expect((await b.request<{ delete_companies: { affected_rows: number } }>(DELETE_COMPANY, { id })).delete_companies.affected_rows).toBe(0);
    expect((await a.request<{ companies: unknown[] }>(LIST_COMPANIES)).companies).toHaveLength(1);
  });

  it('should not allow choosing the organization of a new company (taken from the session)', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(INSERT_COMPANY, { object: { name: 'x', organization_id: orgB.id } }),
      'organization_id',
    );
  });

  it('should reject an unknown kind and status', async () => {
    const { orgA, user } = await createTwoOrgs();
    const client = asOrgAdmin(user.id, orgA.id);
    await expectError(client.request(INSERT_COMPANY, { object: { name: 'x', kind: 'martian' } }));
    await expectError(client.request(INSERT_COMPANY, { object: { name: 'x', status: 'zombie' } }));
  });

  it('should write an audit row on insert', async () => {
    const { orgA, user } = await createTwoOrgs();
    const created = await asOrgAdmin(user.id, orgA.id).request<{ insert_companies_one: Company }>(INSERT_COMPANY, {
      object: { name: 'Audited' },
    });
    const data = await asOrgAdmin(user.id, orgA.id).request<{ audit_log: { action: string; changes: Record<string, unknown> }[] }>(
      AUDIT,
      { orgId: orgA.id, entityId: created.insert_companies_one.id },
    );
    expect(data.audit_log).toHaveLength(1);
    expect(data.audit_log[0].action).toBe('insert');
    expect(data.audit_log[0].changes).toMatchObject({ name: 'Audited' });
  });

  it('should hide companies from the base user role', async () => {
    const { user } = await createTwoOrgs();
    await expectDenied(asUser(user.id).request(LIST_COMPANIES), 'companies');
  });
});

const INSERT_SCHEDULE = `
  mutation InsertSchedule($object: work_schedules_insert_input!) {
    insert_work_schedules_one(object: $object) { id name timezone windows organization_id }
  }
`;
const LIST_SCHEDULES = `query { work_schedules { id name } }`;
const UPDATE_SCHEDULE = `
  mutation UpdateSchedule($id: uuid!, $windows: jsonb!) {
    update_work_schedules(where: { id: { _eq: $id } }, _set: { windows: $windows }) { affected_rows }
  }
`;
const NIGHT = [{ days: [1, 2, 3, 4, 5], from: '22:00', to: '06:00' }];

describe('work_schedules', () => {
  it('should let an org_admin create and update a schedule and keep it org-isolated', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const created = await a.request<{ insert_work_schedules_one: { id: string; windows: unknown; timezone: string } }>(
      INSERT_SCHEDULE,
      { object: { name: 'Night Shift', timezone: 'Europe/Moscow', windows: NIGHT, description: 'Nights' } },
    );
    expect(created.insert_work_schedules_one.windows).toEqual(NIGHT);
    const id = created.insert_work_schedules_one.id;

    const upd = await a.request<{ update_work_schedules: { affected_rows: number } }>(UPDATE_SCHEDULE, { id, windows: [] });
    expect(upd.update_work_schedules.affected_rows).toBe(1);

    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ work_schedules: unknown[] }>(LIST_SCHEDULES)).work_schedules).toEqual([]);
    expect((await b.request<{ update_work_schedules: { affected_rows: number } }>(UPDATE_SCHEDULE, { id, windows: NIGHT })).update_work_schedules.affected_rows).toBe(0);
  });

  it('should reject windows that are not a JSON array', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await expectError(a.request(INSERT_SCHEDULE, { object: { name: 'bad', windows: { days: [1] } } }));
    await expectError(a.request(INSERT_SCHEDULE, { object: { name: 'bad2', windows: 'always' } }));
  });

  it('should reject an unknown timezone', async () => {
    const { orgA, user } = await createTwoOrgs();
    await expectError(
      asOrgAdmin(user.id, orgA.id).request(INSERT_SCHEDULE, { object: { name: 'tz', timezone: 'Mars/Olympus', windows: [] } }),
    );
  });

  it('should write an audit row on insert', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const created = await a.request<{ insert_work_schedules_one: { id: string } }>(INSERT_SCHEDULE, {
      object: { name: 'Audited', windows: [] },
    });
    const data = await a.request<{ audit_log: { action: string }[] }>(
      `query($id: uuid!) { audit_log(where: { entity: { _eq: "work_schedules" }, entity_id: { _eq: $id } }) { action } }`,
      { id: created.insert_work_schedules_one.id },
    );
    expect(data.audit_log.map((r) => r.action)).toEqual(['insert']);
  });
});
