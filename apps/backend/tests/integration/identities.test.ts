import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asOrgAdmin, orgAdminToken } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

const INSERT_IDENTITY = `
  mutation InsertIdentity($object: identities_insert_input!) {
    insert_identities_one(object: $object) {
      id number code status source matching_enabled is_synthetic detection_count attributes custom_fields
    }
  }
`;
const UPDATE_IDENTITY = `
  mutation UpdateIdentity($id: uuid!, $set: identities_set_input!) {
    update_identities(where: { id: { _eq: $id } }, _set: $set) { affected_rows }
  }
`;
const INSERT_PROFILE = `mutation($object: profiles_insert_input!) { insert_profiles_one(object: $object) { id } }`;
const PROFILE = `query($id: uuid!) { profiles_by_pk(id: $id) { identities_count has_face } }`;
const IDENTITY = `query($id: uuid!) { identities_by_pk(id: $id) { profile_id linked_at linked_by } }`;
const INSERT_PHOTO = `
  mutation InsertPhoto($object: identity_photos_insert_input!) { insert_identity_photos_one(object: $object) { id kind } }
`;
const AUDIT = `
  query($entity: String!, $id: uuid!) {
    audit_log(where: { entity: { _eq: $entity }, entity_id: { _eq: $id } }, order_by: { occurred_at: asc }) { action changes }
  }
`;

type Counts = { profiles_by_pk: { identities_count: number; has_face: boolean } };
type Linked = { identities_by_pk: { profile_id: string | null; linked_at: string | null; linked_by: string | null } };
type Audit = { audit_log: { action: string; changes: Record<string, unknown> }[] };

async function newProfile(userId: string, orgId: string): Promise<string> {
  const data = await asOrgAdmin(userId, orgId).request<{ insert_profiles_one: { id: string } }>(INSERT_PROFILE, {
    object: { first_name: 'Ann', last_name: 'Lee' },
  });
  return data.insert_profiles_one.id;
}

describe('identities', () => {
  it('should assign IDENTITY codes per organization with lifecycle defaults', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const first = await a.request<{ insert_identities_one: Record<string, unknown> }>(INSERT_IDENTITY, { object: {} });
    expect(first.insert_identities_one).toMatchObject({
      number: 1,
      code: 'IDENTITY-00001',
      status: 'unverified',
      source: 'manual',
      matching_enabled: true,
      is_synthetic: false,
      detection_count: 0,
      attributes: {},
      custom_fields: {},
    });
    expect((await createIdentity(user.id, orgA.id)).code).toBe('IDENTITY-00002');
    expect((await createIdentity(other.id, orgB.id)).code).toBe('IDENTITY-00001');
  });

  it('should not let org_admin write system-managed columns', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    for (const column of ['matching_enabled', 'detection_count', 'confidence', 'first_seen_at', 'last_seen_at', 'linked_at', 'linked_by', 'number']) {
      const value = column === 'matching_enabled' ? false : column.endsWith('_at') ? new Date().toISOString() : column === 'linked_by' ? user.id : 1;
      await expectDenied(a.request(INSERT_IDENTITY, { object: { [column]: value } }), column);
    }
    const id = (await createIdentity(user.id, orgA.id)).id;
    await expectDenied(a.request(UPDATE_IDENTITY, { id, set: { matching_enabled: false } }), 'matching_enabled');
  });

  it('should maintain identities_count, has_face and link metadata on link, move, unlink and delete', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p1 = await newProfile(user.id, orgA.id);
    const p2 = await newProfile(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);

    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { profile_id: p1 } });
    expect((await a.request<Counts>(PROFILE, { id: p1 })).profiles_by_pk).toEqual({ identities_count: 1, has_face: true });
    const linked = (await a.request<Linked>(IDENTITY, { id: identity.id })).identities_by_pk;
    expect(linked.linked_at).not.toBeNull();
    expect(linked.linked_by).toBe(user.id);

    await createIdentity(user.id, orgA.id, { profile_id: p1 });
    expect((await a.request<Counts>(PROFILE, { id: p1 })).profiles_by_pk.identities_count).toBe(2);

    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { profile_id: p2 } });
    expect((await a.request<Counts>(PROFILE, { id: p1 })).profiles_by_pk.identities_count).toBe(1);
    expect((await a.request<Counts>(PROFILE, { id: p2 })).profiles_by_pk).toEqual({ identities_count: 1, has_face: true });

    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { profile_id: null } });
    expect((await a.request<Counts>(PROFILE, { id: p2 })).profiles_by_pk).toEqual({ identities_count: 0, has_face: false });
    expect((await a.request<Linked>(IDENTITY, { id: identity.id })).identities_by_pk).toEqual({
      profile_id: null,
      linked_at: null,
      linked_by: null,
    });

    await a.request(`mutation($id: uuid!) { delete_identities_by_pk(id: $id) { id } }`, { id: identity.id });
    await runSql(`update itap.identities set profile_id = null where profile_id = '${p1}'`);
    expect((await a.request<Counts>(PROFILE, { id: p1 })).profiles_by_pk.identities_count).toBe(0);
  });

  it('should decrement identities_count when a linked identity is deleted', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id, { profile_id: p });
    await a.request(`mutation($id: uuid!) { delete_identities_by_pk(id: $id) { id } }`, { id: identity.id });
    expect((await a.request<Counts>(PROFILE, { id: p })).profiles_by_pk.identities_count).toBe(0);
  });

  it('should reject a profile from another organization (composite FK)', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const foreign = await newProfile(other.id, orgB.id);
    const err = await expectError(asOrgAdmin(user.id, orgA.id).request(INSERT_IDENTITY, { object: { profile_id: foreign } }));
    expect(err.message).toMatch(/foreign key/i);
  });

  it('should audit identities but skip counter-only updates, and not audit profile counter changes', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    await runSql(
      `update itap.identities set detection_count = 5, last_seen_at = now(), first_seen_at = now(), confidence = 0.9 where id = '${identity.id}'`,
    );
    expect((await a.request<Audit>(AUDIT, { entity: 'identities', id: identity.id })).audit_log.map((r) => r.action)).toEqual(['insert']);

    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { profile_id: p } });
    const identityAudit = (await a.request<Audit>(AUDIT, { entity: 'identities', id: identity.id })).audit_log;
    expect(identityAudit.map((r) => r.action)).toEqual(['insert', 'update']);
    expect(identityAudit[1].changes).toHaveProperty('profile_id');
    expect((await a.request<Audit>(AUDIT, { entity: 'profiles', id: p })).audit_log.map((r) => r.action)).toEqual(['insert']);
  });

  it('should isolate identities per organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ identities: unknown[] }>(`query { identities { id } }`)).identities).toEqual([]);
    const updated = await b.request<{ update_identities: { affected_rows: number } }>(UPDATE_IDENTITY, {
      id: identity.id,
      set: { is_synthetic: true },
    });
    expect(updated.update_identities.affected_rows).toBe(0);
  });
});

describe('identity photos', () => {
  it('should accept own-bucket photos, reject foreign ones, keep device_id read-only and cascade on identity delete', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const own = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id, undefined, 'image/png');
    const foreign = await uploadFile(orgAdminToken(other.id, orgB.id), orgB.id, undefined, 'image/png');
    if (!('id' in own) || !('id' in foreign)) throw new Error('upload failed');

    const err = await expectError(a.request(INSERT_PHOTO, { object: { identity_id: identity.id, file_id: foreign.id } }));
    expect(err.message).toContain('file_not_in_org_bucket:file_id');
    await expectDenied(
      a.request(INSERT_PHOTO, { object: { identity_id: identity.id, file_id: own.id, device_id: randomUUID() } }),
      'device_id',
    );
    const photo = await a.request<{ insert_identity_photos_one: { id: string; kind: string } }>(INSERT_PHOTO, {
      object: { identity_id: identity.id, file_id: own.id },
    });
    expect(photo.insert_identity_photos_one.kind).toBe('manual');

    const primaryErr = await expectError(a.request(UPDATE_IDENTITY, { id: identity.id, set: { primary_photo_file_id: foreign.id } }));
    expect(primaryErr.message).toContain('file_not_in_org_bucket:primary_photo_file_id');
    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { primary_photo_file_id: own.id } });

    await a.request(`mutation($id: uuid!) { delete_identities_by_pk(id: $id) { id } }`, { id: identity.id });
    const left = await runSqlRows(`select count(*) as n from itap.identity_photos where identity_id = '${identity.id}'`);
    expect(left[0].n).toBe('0');
  });
});
