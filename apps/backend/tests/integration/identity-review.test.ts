import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import {
  auditRows,
  identityState,
  MERGE,
  newProfile,
  pgArray,
  PROFILE_COUNT,
  UPDATE_IDENTITY,
} from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

const INSERT_REQUEST = `
  mutation($o: verification_requests_insert_input!) {
    insert_verification_requests_one(object: $o) { id status requested_by }
  }
`;
const APPROVE = `
  mutation($id: uuid!, $reason: String) {
    approve_verification(args: { p_request: $id, p_reason: $reason }) { id status decided_by decided_at reason }
  }
`;
const REJECT = `
  mutation($id: uuid!, $reason: String) {
    reject_verification(args: { p_request: $id, p_reason: $reason }) { id status decided_by }
  }
`;
type Decision = {
  id: string;
  status: string;
  decided_by: string | null;
  decided_at?: string | null;
  reason?: string | null;
};
type Counts = {
  profiles_by_pk: { identities_count: number; has_face: boolean };
};

const ordered = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

describe('verification requests', () => {
  it('should approve a pending request once: identity verified, audit approve with the caller', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const created = await a.request<{
      insert_verification_requests_one: {
        id: string;
        status: string;
        requested_by: string;
      };
    }>(INSERT_REQUEST, {
      o: { identity_id: identity.id, evidence: { note: 'badge photo' } },
    });
    const request = created.insert_verification_requests_one;
    expect(request).toMatchObject({ status: 'pending', requested_by: user.id });

    const approved = await a.request<{ approve_verification: Decision[] }>(APPROVE, {
      id: request.id,
      reason: 'looks right',
    });
    expect(approved.approve_verification[0]).toMatchObject({
      status: 'approved',
      decided_by: user.id,
      reason: 'looks right',
    });
    expect(approved.approve_verification[0].decided_at).not.toBeNull();
    expect((await identityState(identity.id)).status).toBe('verified');
    expect(await auditRows(request.id)).toContainEqual({
      action: 'approve',
      user_id: user.id,
      reason: 'looks right',
    });

    const err = await expectError(a.request(APPROVE, { id: request.id }));
    expect(err.message).toContain('verification_not_pending');
  });

  it('should reject a pending request without touching the identity status', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const { insert_verification_requests_one: request } = await a.request<{
      insert_verification_requests_one: { id: string };
    }>(INSERT_REQUEST, { o: { identity_id: identity.id } });
    const rejected = await a.request<{ reject_verification: Decision[] }>(REJECT, { id: request.id, reason: 'blurry' });
    expect(rejected.reject_verification[0]).toMatchObject({
      status: 'rejected',
      decided_by: user.id,
    });
    expect((await identityState(identity.id)).status).toBe('unverified');
    expect(await auditRows(request.id)).toContainEqual({
      action: 'reject',
      user_id: user.id,
      reason: 'blurry',
    });
    expect((await expectError(a.request(APPROVE, { id: request.id }))).message).toContain('verification_not_pending');
  });

  it('should scope decisions to the session organization and keep decision columns read-only', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const { insert_verification_requests_one: request } = await a.request<{
      insert_verification_requests_one: { id: string };
    }>(INSERT_REQUEST, { o: { identity_id: identity.id } });
    const err = await expectError(asOrgAdmin(other.id, orgB.id).request(APPROVE, { id: request.id }));
    expect(err.message).toContain('verification_not_found');
    expect((await identityState(identity.id)).status).toBe('unverified');
    for (const column of ['status', 'decided_by', 'decided_at', 'requested_by']) {
      const value = column === 'status' ? 'approved' : column === 'decided_at' ? new Date().toISOString() : user.id;
      await expectDenied(
        a.request(INSERT_REQUEST, {
          o: { identity_id: identity.id, [column]: value },
        }),
        column,
      );
    }
  });
});

describe('identity duplicate candidates and relationships', () => {
  it('should reject an unordered pair and let org_admin change only the status', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [lo, hi] = ordered((await createIdentity(user.id, orgA.id)).id, (await createIdentity(user.id, orgA.id)).id);
    await expect(
      runSql(
        `insert into itap.identity_duplicate_candidates (organization_id, identity_a_id, identity_b_id, similarity)
         values ('${orgA.id}', '${hi}', '${lo}', 0.8)`,
      ),
    ).rejects.toThrow(/identity_duplicate_candidates_ordered_pair/);
    await runSql(
      `insert into itap.identity_duplicate_candidates (organization_id, identity_a_id, identity_b_id, similarity)
       values ('${orgA.id}', '${lo}', '${hi}', 0.8)`,
    );
    await expect(
      runSql(
        `insert into itap.identity_duplicate_candidates (organization_id, identity_a_id, identity_b_id, similarity)
         values ('${orgA.id}', '${lo}', '${hi}', 0.9)`,
      ),
    ).rejects.toThrow(/duplicate key/);
    const UPDATE = `mutation($set: identity_duplicate_candidates_set_input!) {
      update_identity_duplicate_candidates(where: {}, _set: $set) { affected_rows }
    }`;
    await expectDenied(a.request(UPDATE, { set: { similarity: 0.1 } }), 'similarity');
    const updated = await a.request<{
      update_identity_duplicate_candidates: { affected_rows: number };
    }>(UPDATE, {
      set: { status: 'dismissed' },
    });
    expect(updated.update_identity_duplicate_candidates.affected_rows).toBe(1);
    await expectDenied(
      a.request(`mutation { insert_identity_duplicate_candidates_one(object: {}) { id } }`),
      'insert_identity_duplicate_candidates_one',
    );
  });

  it('should close candidates between merged identities as merged', async () => {
    const { orgA, user } = await createTwoOrgs();
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    const [lo, hi] = ordered(target.id, source.id);
    await runSql(
      `insert into itap.identity_duplicate_candidates (organization_id, identity_a_id, identity_b_id, similarity)
       values ('${orgA.id}', '${lo}', '${hi}', 0.8)`,
    );
    await asOrgAdmin(user.id, orgA.id).request(MERGE, {
      target: target.id,
      sources: pgArray([source.id]),
    });
    const rows = await runSqlRows(
      `select status from itap.identity_duplicate_candidates where identity_a_id = '${lo}'`,
    );
    expect(rows).toEqual([{ status: 'merged' }]);
  });

  it('should keep relationships as ordered unique pairs', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [lo, hi] = ordered((await createIdentity(user.id, orgA.id)).id, (await createIdentity(user.id, orgA.id)).id);
    const INSERT = `mutation($o: identity_relationships_insert_input!) { insert_identity_relationships_one(object: $o) { id relation } }`;
    expect((await expectError(a.request(INSERT, { o: { identity_a_id: hi, identity_b_id: lo } }))).message).toMatch(
      /ordered_pair/,
    );
    const created = await a.request<{
      insert_identity_relationships_one: { relation: string };
    }>(INSERT, {
      o: { identity_a_id: lo, identity_b_id: hi, relation: 'companion' },
    });
    expect(created.insert_identity_relationships_one.relation).toBe('companion');
    expect((await expectError(a.request(INSERT, { o: { identity_a_id: lo, identity_b_id: hi } }))).message).toMatch(
      /unique|uniqueness/i,
    );
  });
});

describe('profile links', () => {
  it('should clear the primary flag when an identity moves between profiles unless it is set in the same update', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [p1, p2, p3] = [
      await newProfile(user.id, orgA.id),
      await newProfile(user.id, orgA.id),
      await newProfile(user.id, orgA.id),
    ];
    const identity = await createIdentity(user.id, orgA.id, {
      profile_id: p1,
      is_primary_for_profile: true,
    });
    await a.request(UPDATE_IDENTITY, {
      id: identity.id,
      set: { profile_id: p2 },
    });
    expect(await identityState(identity.id)).toMatchObject({
      profile_id: p2,
      is_primary_for_profile: false,
    });
    await a.request(UPDATE_IDENTITY, {
      id: identity.id,
      set: { profile_id: p3, is_primary_for_profile: true },
    });
    expect(await identityState(identity.id)).toMatchObject({
      profile_id: p3,
      is_primary_for_profile: true,
    });
  });

  it('should unlink identities when their profile is deleted, keeping counters consistent', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [doomed, kept] = [await newProfile(user.id, orgA.id), await newProfile(user.id, orgA.id)];
    const primary = await createIdentity(user.id, orgA.id, {
      profile_id: doomed,
      is_primary_for_profile: true,
    });
    const second = await createIdentity(user.id, orgA.id, {
      profile_id: doomed,
    });
    await createIdentity(user.id, orgA.id, { profile_id: kept });

    const deleted = await a.request<{
      delete_profiles_by_pk: { id: string } | null;
    }>(`mutation($id: uuid!) { delete_profiles_by_pk(id: $id) { id } }`, {
      id: doomed,
    });
    expect(deleted.delete_profiles_by_pk?.id).toBe(doomed);
    expect(await identityState(primary.id)).toEqual({
      status: 'unverified',
      profile_id: null,
      is_primary_for_profile: false,
    });
    expect((await identityState(second.id)).profile_id).toBeNull();
    expect((await a.request<Counts>(PROFILE_COUNT, { id: kept })).profiles_by_pk).toEqual({
      identities_count: 1,
      has_face: true,
    });
    const counts = await runSqlRows(`
      select p.id, p.identities_count, (select count(*) from itap.identities i where i.profile_id = p.id) as actual
      from itap.profiles p where p.organization_id = '${orgA.id}'`);
    for (const row of counts) expect(row.identities_count).toBe(row.actual);
  });
});
