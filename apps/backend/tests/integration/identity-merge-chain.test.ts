import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import {
  addCandidate,
  addPhotoAndEmbedding,
  candidateState,
  identityState,
  MERGE,
  type MergeRow,
  newProfile,
  owners,
  pgArray,
  ROLLBACK,
  SPLIT,
} from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

type Merged = { merge_identities: MergeRow[] };

async function mergeStatus(id: string): Promise<string> {
  const [row] = await runSqlRows(`select status from itap.identity_merges where id = '${id}'`);
  return row.status ?? '';
}

describe('chained merges', () => {
  it('should refuse to roll back a merge whose target was merged later, and undo newest first exactly', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const s = await createIdentity(user.id, orgA.id, { status: 'verified' });
    const t = await createIdentity(user.id, orgA.id);
    const t2 = await createIdentity(user.id, orgA.id);
    const rs = await addPhotoAndEmbedding(user.id, orgA.id, s.id, 0);
    const rt = await addPhotoAndEmbedding(user.id, orgA.id, t.id, 1);
    const rt2 = await addPhotoAndEmbedding(user.id, orgA.id, t2.id, 2);
    const initial = await owners([s.id, t.id, t2.id]);

    const m1 = (await a.request<Merged>(MERGE, { target: t.id, sources: pgArray([s.id]) })).merge_identities[0];
    const m2 = (await a.request<Merged>(MERGE, { target: t2.id, sources: pgArray([t.id]) })).merge_identities[0];
    const afterBoth = await owners([s.id, t.id, t2.id]);
    for (const row of [rs.photo, rs.embedding, rt.photo, rt.embedding, rt2.photo]) expect(afterBoth[row]).toBe(t2.id);

    const err = await expectError(a.request(ROLLBACK, { id: m1.id }));
    expect(err.message).toContain('merge_target_merged');
    expect(await owners([s.id, t.id, t2.id])).toEqual(afterBoth);
    expect(await mergeStatus(m1.id)).toBe('completed');
    expect((await identityState(s.id)).status).toBe('merged');

    await a.request(ROLLBACK, { id: m2.id });
    await a.request(ROLLBACK, { id: m1.id });
    expect(await owners([s.id, t.id, t2.id])).toEqual(initial);
    expect((await identityState(s.id)).status).toBe('verified');
    expect((await identityState(t.id)).status).toBe('unverified');
    expect([await mergeStatus(m1.id), await mergeStatus(m2.id)]).toEqual(['rolled_back', 'rolled_back']);
  });

  it('should refuse a rollback when recorded rows left the target (split after merge)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const t = await createIdentity(user.id, orgA.id);
    const s = await createIdentity(user.id, orgA.id);
    await addPhotoAndEmbedding(user.id, orgA.id, t.id, 0);
    const moved = await addPhotoAndEmbedding(user.id, orgA.id, s.id, 1);
    const m = (await a.request<Merged>(MERGE, { target: t.id, sources: pgArray([s.id]) })).merge_identities[0];
    await a.request(SPLIT, { id: t.id, embeddings: pgArray([moved.embedding]), photos: pgArray([moved.photo]) });

    const err = await expectError(a.request(ROLLBACK, { id: m.id }));
    expect(err.message).toContain('merge_rows_moved');
    expect(err.message).toContain('2');
    expect(await mergeStatus(m.id)).toBe('completed');
    expect((await identityState(s.id)).status).toBe('merged');
  });
});

describe('merge side effects', () => {
  it('should close every open candidate touching a source with the merge id, and reopen them on rollback', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const t = await createIdentity(user.id, orgA.id);
    const s = await createIdentity(user.id, orgA.id);
    const outsider = await createIdentity(user.id, orgA.id);
    const unrelated = await createIdentity(user.id, orgA.id);
    await addCandidate(orgA.id, t.id, s.id);
    await addCandidate(orgA.id, s.id, outsider.id);
    await addCandidate(orgA.id, t.id, unrelated.id);
    await addCandidate(orgA.id, outsider.id, unrelated.id);
    const m = (await a.request<Merged>(MERGE, { target: t.id, sources: pgArray([s.id]) })).merge_identities[0];

    expect(await candidateState(t.id, s.id)).toEqual({ status: 'merged', merge_id: m.id });
    expect(await candidateState(s.id, outsider.id)).toEqual({ status: 'merged', merge_id: m.id });
    expect(await candidateState(t.id, unrelated.id)).toEqual({ status: 'open', merge_id: null });
    expect(await candidateState(outsider.id, unrelated.id)).toEqual({ status: 'open', merge_id: null });

    await a.request(ROLLBACK, { id: m.id });
    expect(await candidateState(t.id, s.id)).toEqual({ status: 'open', merge_id: null });
    expect(await candidateState(s.id, outsider.id)).toEqual({ status: 'open', merge_id: null });
  });

  it('should cancel pending verification requests of the sources', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const t = await createIdentity(user.id, orgA.id);
    const s = await createIdentity(user.id, orgA.id);
    const INSERT = `mutation($o: verification_requests_insert_input!) { insert_verification_requests_one(object: $o) { id } }`;
    await a.request(INSERT, { o: { identity_id: s.id } });
    await a.request(INSERT, { o: { identity_id: t.id } });
    await a.request(MERGE, { target: t.id, sources: pgArray([s.id]) });
    const rows = await runSqlRows(
      `select identity_id, status from itap.verification_requests where identity_id in ('${s.id}', '${t.id}')`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.identity_id, r.status]))).toEqual({ [s.id]: 'cancelled', [t.id]: 'pending' });
  });

  it('should hand a source primary flag to a target already linked to the same profile, and take it back on rollback', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const t = await createIdentity(user.id, orgA.id, { profile_id: p });
    const s = await createIdentity(user.id, orgA.id, { profile_id: p, is_primary_for_profile: true });
    const m = (await a.request<Merged>(MERGE, { target: t.id, sources: pgArray([s.id]) })).merge_identities[0];
    expect(await identityState(t.id)).toEqual({ status: 'unverified', profile_id: p, is_primary_for_profile: true });
    expect(await identityState(s.id)).toEqual({ status: 'merged', profile_id: null, is_primary_for_profile: false });

    await a.request(ROLLBACK, { id: m.id });
    expect(await identityState(t.id)).toEqual({ status: 'unverified', profile_id: p, is_primary_for_profile: false });
    expect(await identityState(s.id)).toEqual({ status: 'unverified', profile_id: p, is_primary_for_profile: true });
  });
});
