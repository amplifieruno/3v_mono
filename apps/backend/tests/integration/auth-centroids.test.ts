import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { MERGE, type MergeRow, newProfile, pgArray, ROLLBACK, UPDATE_IDENTITY } from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

type Centroid = { count: number; vector: number[] } | null;

async function centroid(identityId: string): Promise<Centroid> {
  const rows = await runSqlRows(
    `select template_count, centroid::text as v from itap.identity_centroids where identity_id = '${identityId}'`,
  );
  if (rows.length === 0) return null;
  return { count: Number(rows[0].template_count), vector: JSON.parse(String(rows[0].v)) as number[] };
}

const approx = (values: number[], expected: Record<number, number>): void => {
  for (const [i, v] of values.entries()) expect(v).toBeCloseTo(expected[i] ?? 0, 5);
};

describe('identity centroids', () => {
  it('should keep the normalized mean of the templates on insert and delete', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    expect(await centroid(identity.id)).toBeNull();
    const e0 = await addEmbedding(orgA.id, identity.id, axis(0), 0.9);
    approx((await centroid(identity.id))!.vector, { 0: 1 });
    await addEmbedding(orgA.id, identity.id, axis(1), 0.8);
    const two = await centroid(identity.id);
    expect(two!.count).toBe(2);
    approx(two!.vector, { 0: Math.SQRT1_2, 1: Math.SQRT1_2 });
    // A sixth, worse embedding is not a template: the centroid ignores it.
    for (const [i, q] of [0.7, 0.6, 0.5, 0.1].entries()) await addEmbedding(orgA.id, identity.id, axis(2 + i), q);
    expect((await centroid(identity.id))!.count).toBe(5);
    approx((await centroid(identity.id))!.vector, { 0: 0.4472136, 1: 0.4472136, 2: 0.4472136, 3: 0.4472136, 4: 0.4472136 });
    await runSql(`delete from itap.identity_embeddings where id = '${e0}'`);
    const after = await centroid(identity.id);
    expect(after!.count).toBe(5);
    approx(after!.vector, { 1: 0.4472136, 2: 0.4472136, 3: 0.4472136, 4: 0.4472136, 5: 0.4472136 });
    await runSql(`delete from itap.identity_embeddings where identity_id = '${identity.id}'`);
    expect(await centroid(identity.id)).toBeNull();
  });

  it('should remove a centroid when the identity is archived and restore it when reactivated', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    await addEmbedding(orgA.id, identity.id, axis(3), 0.9);
    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { status: 'archived' } });
    expect(await centroid(identity.id)).toBeNull();
    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { status: 'unverified' } });
    approx((await centroid(identity.id))!.vector, { 3: 1 });
  });

  it('should drop merged sources and fold their templates into the target; rollback restores both', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    await addEmbedding(orgA.id, target.id, axis(0), 0.9);
    await addEmbedding(orgA.id, source.id, axis(1), 0.9);
    const merged = await a.request<{ merge_identities: MergeRow[] }>(MERGE, {
      target: target.id,
      sources: pgArray([source.id]),
      reason: 'same person',
    });
    expect(await centroid(source.id)).toBeNull();
    approx((await centroid(target.id))!.vector, { 0: Math.SQRT1_2, 1: Math.SQRT1_2 });
    await a.request(ROLLBACK, { id: merged.merge_identities[0].id });
    approx((await centroid(source.id))!.vector, { 1: 1 });
    approx((await centroid(target.id))!.vector, { 0: 1 });
  });
});

describe('synthetic identities', () => {
  it('should never link a synthetic identity to a profile', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);
    const linked = await expectError(createIdentity(user.id, orgA.id, { is_synthetic: true, profile_id: profile }));
    expect(linked.message).toContain('identities_synthetic_unlinked');
    const synthetic = await createIdentity(user.id, orgA.id, { is_synthetic: true });
    const link = await expectError(a.request(UPDATE_IDENTITY, { id: synthetic.id, set: { profile_id: profile } }));
    expect(link.message).toContain('identities_synthetic_unlinked');
  });

  it('should refuse merging synthetic and production identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const real = await createIdentity(user.id, orgA.id);
    const synthetic = await createIdentity(user.id, orgA.id, { is_synthetic: true });
    for (const [t, s] of [[real.id, synthetic.id], [synthetic.id, real.id]]) {
      const e = await expectError(a.request(MERGE, { target: t, sources: pgArray([s]), reason: 'x' }));
      expect(e.message).toContain('identity_synthetic_mismatch');
    }
  });
});

describe('access credential trigger order (slice 8 carry)', () => {
  it('should fire the commit-time access epoch triggers after segment_inputs_changed on every table', async () => {
    const rows = await runSqlRows(
      `select tgrelid::regclass::text as tbl, tgname from pg_trigger
       where tgrelid::regclass::text like 'itap.%' and tginitdeferred
         and (tgname like '%access_credentials%' or tgname like 'segment_inputs_changed%')`,
    );
    const byTable = new Map<string, string[]>();
    for (const r of rows) byTable.set(String(r.tbl), [...(byTable.get(String(r.tbl)) ?? []), String(r.tgname)]);
    let checked = 0;
    for (const [table, names] of byTable) {
      const access = names.filter((n) => n.includes('access_credentials'));
      const segment = names.filter((n) => n.startsWith('segment_inputs_changed'));
      for (const n of access) expect(n, `${table}.${n}`).toMatch(/^zz_access_credentials_/);
      if (access.length > 0 && segment.length > 0) {
        checked += 1;
        expect([...access, ...segment].sort().slice(0, segment.length).sort(), table).toEqual([...segment].sort());
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
