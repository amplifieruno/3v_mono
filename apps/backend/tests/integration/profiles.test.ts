import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asOrgAdmin, orgAdminToken } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

const INSERT_PROFILE = `
  mutation InsertProfile($object: profiles_insert_input!) {
    insert_profiles_one(object: $object) { id number code has_face identities_count status profile_type access_level custom_fields }
  }
`;
const LIST_PROFILES = `query { profiles(order_by: { number: asc }) { id code } }`;
const UPDATE_PROFILE = `
  mutation UpdateProfile($id: uuid!, $set: profiles_set_input!) {
    update_profiles(where: { id: { _eq: $id } }, _set: $set) { affected_rows }
  }
`;
const INSERT_COMPANY = `mutation($object: companies_insert_input!) { insert_companies_one(object: $object) { id } }`;
const INSERT_SCHEDULE = `mutation($object: work_schedules_insert_input!) { insert_work_schedules_one(object: $object) { id } }`;
const INSERT_DEFINITION = `
  mutation InsertDefinition($object: custom_attribute_definitions_insert_input!) {
    insert_custom_attribute_definitions_one(object: $object) { id entity key data_type required is_active }
  }
`;

type Profile = {
  id: string;
  number: number;
  code: string;
  has_face: boolean;
  identities_count: number;
  status: string;
  profile_type: string;
  access_level: string;
  custom_fields: Record<string, unknown>;
};

const profile = (extra: Record<string, unknown> = {}) => ({ first_name: 'Ann', last_name: 'Lee', ...extra });

describe('profiles', () => {
  it('should assign consecutive codes per organization and default the lifecycle fields', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const first = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    const second = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ first_name: 'Bob' }) });
    expect(first.insert_profiles_one).toMatchObject({
      number: 1,
      code: 'PROFILE-00001',
      status: 'active',
      profile_type: 'employee',
      access_level: 'basic',
      custom_fields: {},
    });
    expect(second.insert_profiles_one.code).toBe('PROFILE-00002');

    const b = asOrgAdmin(other.id, orgB.id);
    const inB = await b.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    expect(inB.insert_profiles_one.code).toBe('PROFILE-00001');
  });

  it('should report has_face false for a new profile and true once identities_count is positive', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const created = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    expect(created.insert_profiles_one).toMatchObject({ has_face: false, identities_count: 0 });
    await runSql(`update itap.profiles set identities_count = 1 where id = '${created.insert_profiles_one.id}'`);
    const after = await a.request<{ profiles: { has_face: boolean }[] }>(`query { profiles { has_face } }`);
    expect(after.profiles).toEqual([{ has_face: true }]);
  });

  it('should not let org_admin write number, code or identities_count', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await expectDenied(a.request(INSERT_PROFILE, { object: profile({ identities_count: 5 }) }), 'identities_count');
    await expectDenied(a.request(INSERT_PROFILE, { object: profile({ number: 99 }) }), 'number');
    await expectDenied(a.request(INSERT_PROFILE, { object: profile({ code: 'X' }) }), 'code');
    const created = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    await expectDenied(a.request(UPDATE_PROFILE, { id: created.insert_profiles_one.id, set: { identities_count: 3 } }), 'identities_count');
  });

  it('should reject a company or work schedule from another organization (composite FK)', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    const company = await b.request<{ insert_companies_one: { id: string } }>(INSERT_COMPANY, { object: { name: 'B Co' } });
    const schedule = await b.request<{ insert_work_schedules_one: { id: string } }>(INSERT_SCHEDULE, { object: { name: 'B shift' } });
    const e1 = await expectError(a.request(INSERT_PROFILE, { object: profile({ company_id: company.insert_companies_one.id }) }));
    expect(e1.message).toMatch(/foreign key/i);
    const e2 = await expectError(a.request(INSERT_PROFILE, { object: profile({ work_schedule_id: schedule.insert_work_schedules_one.id }) }));
    expect(e2.message).toMatch(/foreign key/i);

    const ownCompany = await a.request<{ insert_companies_one: { id: string } }>(INSERT_COMPANY, { object: { name: 'A Co' } });
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ company_id: ownCompany.insert_companies_one.id }) });
    expect(ok.insert_profiles_one.id).toBeTruthy();
  });

  it('should accept an avatar from the own bucket and reject one from another organization bucket', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const foreign = await uploadFile(orgAdminToken(other.id, orgB.id), orgB.id);
    const own = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id);
    if (!('id' in foreign) || !('id' in own)) throw new Error('upload failed');
    const err = await expectError(a.request(INSERT_PROFILE, { object: profile({ avatar_file_id: foreign.id }) }));
    expect(err.message).toContain('file_not_in_org_bucket:avatar_file_id');
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ avatar_file_id: own.id }) });
    expect(ok.insert_profiles_one.id).toBeTruthy();
  });

  it('should not let org_admin write source_integration_id until integrations exist', async () => {
    const { orgA, user } = await createTwoOrgs();
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(INSERT_PROFILE, { object: profile({ source_integration_id: randomUUID() }) }),
      'source_integration_id',
    );
  });

  it('should isolate profiles per organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    const created = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    expect((await b.request<{ profiles: unknown[] }>(LIST_PROFILES)).profiles).toEqual([]);
    const upd = await b.request<{ update_profiles: { affected_rows: number } }>(UPDATE_PROFILE, { id: created.insert_profiles_one.id, set: { first_name: 'x' } });
    expect(upd.update_profiles.affected_rows).toBe(0);
  });

  it('should write an audit row on insert', async () => {
    const { orgA, user } = await createTwoOrgs();
    const created = await asOrgAdmin(user.id, orgA.id).request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    const rows = await runSqlRows(
      `select action from itap.audit_log where organization_id = '${orgA.id}' and entity = 'profiles' and entity_id = '${created.insert_profiles_one.id}'`,
    );
    expect(rows.map((r) => r.action)).toEqual(['insert']);
  });
});

describe('custom attributes on profiles', () => {
  async function define(orgId: string, userId: string, object: Record<string, unknown>) {
    return asOrgAdmin(userId, orgId).request(INSERT_DEFINITION, { object: { entity: 'profile', ...object } });
  }

  it('should let org_admin manage definitions, unique per entity and key, isolated per org', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    await define(orgA.id, user.id, { key: 'badge', label: 'Badge', data_type: 'string' });
    const dup = await expectError(define(orgA.id, user.id, { key: 'badge', label: 'Again', data_type: 'string' }));
    expect(dup.message).toMatch(/unique|duplicate/i);
    await define(orgA.id, user.id, { entity: 'device', key: 'badge', label: 'Other entity', data_type: 'string' });
    const list = await asOrgAdmin(other.id, orgB.id).request<{ custom_attribute_definitions: unknown[] }>(
      `query { custom_attribute_definitions { id } }`,
    );
    expect(list.custom_attribute_definitions).toEqual([]);
  });

  it('should not let org_admin change entity or key of a definition, but allow other fields', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const created = await a.request<{ insert_custom_attribute_definitions_one: { id: string } }>(INSERT_DEFINITION, {
      object: { entity: 'profile', key: 'badge', label: 'Badge', data_type: 'string' },
    });
    const id = created.insert_custom_attribute_definitions_one.id;
    const UPDATE = `mutation($id: uuid!, $set: custom_attribute_definitions_set_input!) {
      update_custom_attribute_definitions(where: { id: { _eq: $id } }, _set: $set) { affected_rows } }`;
    await expectDenied(a.request(UPDATE, { id, set: { key: 'renamed' } }), 'key');
    await expectDenied(a.request(UPDATE, { id, set: { entity: 'device' } }), 'entity');
    const ok = await a.request<{ update_custom_attribute_definitions: { affected_rows: number } }>(UPDATE, { id, set: { label: 'New' } });
    expect(ok.update_custom_attribute_definitions.affected_rows).toBe(1);
  });

  it('should reject an invalid key format and options on a non-array', async () => {
    const { orgA, user } = await createTwoOrgs();
    await expectError(define(orgA.id, user.id, { key: 'Bad Key', label: 'x', data_type: 'string' }));
    await expectError(define(orgA.id, user.id, { key: 'e', label: 'x', data_type: 'enum', options: { a: 1 } }));
  });

  it('should reject a missing required key with custom_field_invalid:<key>', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await define(orgA.id, user.id, { key: 'badge', label: 'Badge', data_type: 'string', required: true });
    const err = await expectError(a.request(INSERT_PROFILE, { object: profile() }));
    expect(err.message).toContain('custom_field_invalid:badge');
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ custom_fields: { badge: 'B-1' } }) });
    expect(ok.insert_profiles_one.custom_fields).toEqual({ badge: 'B-1' });
  });

  it.each([
    ['string', 'name', 5],
    ['number', 'age', '5'],
    ['boolean', 'flag', 'true'],
    ['date', 'since', '2024-13-45'],
    ['date', 'since', 'yesterday'],
  ])('should reject a wrong %s value for %s', async (dataType, key, value) => {
    const { orgA, user } = await createTwoOrgs();
    await define(orgA.id, user.id, { key, label: key, data_type: dataType });
    const err = await expectError(asOrgAdmin(user.id, orgA.id).request(INSERT_PROFILE, { object: profile({ custom_fields: { [key]: value } }) }));
    expect(err.message).toContain(`custom_field_invalid:${key}`);
  });

  it('should accept valid values of every type', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    for (const [key, data_type] of [['s', 'string'], ['n', 'number'], ['b', 'boolean'], ['d', 'date']]) {
      await define(orgA.id, user.id, { key, label: key, data_type });
    }
    const fields = { s: 'x', n: 4.5, b: false, d: '2024-02-29' };
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ custom_fields: fields }) });
    expect(ok.insert_profiles_one.custom_fields).toEqual(fields);
  });

  it('should reject an enum value outside options', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await define(orgA.id, user.id, { key: 'shirt', label: 'Shirt', data_type: 'enum', options: ['S', 'M', 'L'] });
    const err = await expectError(a.request(INSERT_PROFILE, { object: profile({ custom_fields: { shirt: 'XXL' } }) }));
    expect(err.message).toContain('custom_field_invalid:shirt');
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ custom_fields: { shirt: 'M' } }) });
    expect(ok.insert_profiles_one.custom_fields).toEqual({ shirt: 'M' });
  });

  it('should always reject unknown keys, accept {}, and reject a non-object', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const unknown = await expectError(a.request(INSERT_PROFILE, { object: profile({ custom_fields: { nope: 1 } }) }));
    expect(unknown.message).toContain('custom_field_invalid:nope');
    const empty = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ custom_fields: {} }) });
    expect(empty.insert_profiles_one.custom_fields).toEqual({});
    const arr = await expectError(a.request(INSERT_PROFILE, { object: profile({ custom_fields: [1] }) }));
    expect(arr.message).toContain('custom_field_invalid');
  });

  it('should ignore definitions of other organizations and other entities', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    await define(orgB.id, other.id, { key: 'secret_b', label: 'B', data_type: 'string', required: true });
    await define(orgA.id, user.id, { entity: 'device', key: 'serial', label: 'Serial', data_type: 'string', required: true });
    const ok = await asOrgAdmin(user.id, orgA.id).request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    expect(ok.insert_profiles_one.id).toBeTruthy();
  });

  it('should not validate values of inactive definitions but still treat the key as known', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await define(orgA.id, user.id, { key: 'old', label: 'Old', data_type: 'number', required: true, is_active: false });
    const ok = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile({ custom_fields: { old: 'whatever' } }) });
    expect(ok.insert_profiles_one.custom_fields).toEqual({ old: 'whatever' });
    const missing = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    expect(missing.insert_profiles_one.id).toBeTruthy();
  });

  it('should not revalidate custom_fields when an update leaves them unchanged', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const created = await a.request<{ insert_profiles_one: Profile }>(INSERT_PROFILE, { object: profile() });
    await define(orgA.id, user.id, { key: 'badge', label: 'Badge', data_type: 'string', required: true });
    const upd = await a.request<{ update_profiles: { affected_rows: number } }>(UPDATE_PROFILE, { id: created.insert_profiles_one.id, set: { department: 'IT' } });
    expect(upd.update_profiles.affected_rows).toBe(1);
    const bad = await expectError(a.request(UPDATE_PROFILE, { id: created.insert_profiles_one.id, set: { custom_fields: { badge: 5 } } }));
    expect(bad.message).toContain('custom_field_invalid:badge');
  });
});
