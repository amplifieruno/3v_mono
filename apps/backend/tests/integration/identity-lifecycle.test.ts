import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity, createIdentityAsAdmin } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import {
  addPhoto,
  addPhotoAndEmbedding,
  auditRows,
  identityState,
  MERGE,
  type MergeRow,
  newProfile,
  owners,
  pgArray,
  PROFILE_COUNT,
  ROLLBACK,
} from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

type Merged = { merge_identities: MergeRow[] };
type Counts = {
  profiles_by_pk: { identities_count: number; has_face: boolean };
};

describe('merge_identities', () => {
  it('should merge unlinked identities: sources merged, rows moved and recorded, audit with the caller', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const s1 = await createIdentity(user.id, orgA.id);
    const s2 = await createIdentityAsAdmin(orgA.id, { status: 'verified' });
    await addPhotoAndEmbedding(user.id, orgA.id, target.id, 0);
    const r1 = await addPhotoAndEmbedding(user.id, orgA.id, s1.id, 1);
    const r2 = await addPhotoAndEmbedding(user.id, orgA.id, s2.id, 2);

    const merged = await a.request<Merged>(MERGE, {
      target: target.id,
      sources: pgArray([s1.id, s2.id]),
      reason: 'same person',
    });
    expect(merged.merge_identities).toHaveLength(1);
    const merge = merged.merge_identities[0];
    expect(merge).toMatchObject({
      status: 'completed',
      target_identity_id: target.id,
      merged_by: user.id,
      reason: 'same person',
    });

    expect((await identityState(s1.id)).status).toBe('merged');
    expect((await identityState(s2.id)).status).toBe('merged');
    const owned = await owners([target.id, s1.id, s2.id]);
    for (const row of [r1.photo, r1.embedding, r2.photo, r2.embedding]) expect(owned[row]).toBe(target.id);

    const moves = await runSqlRows(
      `select entity, row_id, from_identity_id from itap.identity_merge_moves where merge_id = '${merge.id}' order by entity, row_id`,
    );
    expect(moves).toHaveLength(4);
    expect(new Set(moves.map((m) => m.row_id))).toEqual(new Set([r1.photo, r1.embedding, r2.photo, r2.embedding]));
    expect(moves.find((m) => m.row_id === r2.photo)).toMatchObject({
      entity: 'identity_photos',
      from_identity_id: s2.id,
    });

    const sources = await runSqlRows(
      `select source_identity_id, previous_status from itap.identity_merge_sources where merge_id = '${merge.id}'`,
    );
    expect(Object.fromEntries(sources.map((s) => [s.source_identity_id, s.previous_status]))).toEqual({
      [s1.id]: 'unverified',
      [s2.id]: 'verified',
    });
    const templates = await runSqlRows(
      `select count(*) as n from itap.identity_embeddings where identity_id = '${target.id}' and is_template`,
    );
    expect(templates[0].n).toBe('3');
    expect(await auditRows(merge.id)).toEqual([{ action: 'merge', user_id: user.id, reason: 'same person' }]);
  });

  it('should refuse sources linked to a different profile than the target (merge_profile_conflict)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [p1, p2] = [await newProfile(user.id, orgA.id), await newProfile(user.id, orgA.id)];
    const target = await createIdentity(user.id, orgA.id, { profile_id: p1 });
    const source = await createIdentity(user.id, orgA.id, { profile_id: p2 });
    const err = await expectError(a.request(MERGE, { target: target.id, sources: pgArray([source.id]) }));
    expect(err.message).toContain('merge_profile_conflict');
    expect(await identityState(source.id)).toMatchObject({
      status: 'unverified',
      profile_id: p2,
    });

    const free = await createIdentity(user.id, orgA.id);
    const other = await createIdentity(user.id, orgA.id, { profile_id: p1 });
    const err2 = await expectError(
      a.request(MERGE, {
        target: free.id,
        sources: pgArray([source.id, other.id]),
      }),
    );
    expect(err2.message).toContain('merge_profile_conflict');
  });

  it('should let an unlinked target inherit the profile and unlink merged sources; rollback restores links', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id, {
      profile_id: p,
      is_primary_for_profile: true,
    });

    const merge = (
      await a.request<Merged>(MERGE, {
        target: target.id,
        sources: pgArray([source.id]),
      })
    ).merge_identities[0];
    expect(await identityState(target.id)).toEqual({
      status: 'unverified',
      profile_id: p,
      is_primary_for_profile: true,
    });
    expect(await identityState(source.id)).toEqual({
      status: 'merged',
      profile_id: null,
      is_primary_for_profile: false,
    });
    expect((await a.request<Counts>(PROFILE_COUNT, { id: p })).profiles_by_pk).toEqual({
      identities_count: 1,
      has_face: true,
    });

    await a.request(ROLLBACK, { id: merge.id });
    expect(await identityState(target.id)).toEqual({
      status: 'unverified',
      profile_id: null,
      is_primary_for_profile: false,
    });
    expect(await identityState(source.id)).toEqual({
      status: 'unverified',
      profile_id: p,
      is_primary_for_profile: true,
    });
    expect((await a.request<Counts>(PROFILE_COUNT, { id: p })).profiles_by_pk.identities_count).toBe(1);
  });

  it('should reject ids of another organization without changing anything', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const target = await createIdentity(user.id, orgA.id);
    const foreign = await createIdentity(other.id, orgB.id);
    const err = await expectError(
      asOrgAdmin(user.id, orgA.id).request(MERGE, {
        target: target.id,
        sources: pgArray([foreign.id]),
      }),
    );
    expect(err.message).toContain('identity_not_found');
    expect((await identityState(foreign.id)).status).toBe('unverified');
    const err2 = await expectError(
      asOrgAdmin(other.id, orgB.id).request(MERGE, {
        target: foreign.id,
        sources: pgArray([target.id]),
      }),
    );
    expect(err2.message).toContain('identity_not_found');

    const source = await createIdentity(user.id, orgA.id);
    const merge = (
      await asOrgAdmin(user.id, orgA.id).request<Merged>(MERGE, {
        target: target.id,
        sources: pgArray([source.id]),
      })
    ).merge_identities[0];
    const err3 = await expectError(asOrgAdmin(other.id, orgB.id).request(ROLLBACK, { id: merge.id }));
    expect(err3.message).toContain('merge_not_found');
    expect((await identityState(source.id)).status).toBe('merged');
  });

  it('should reject a target among the sources, empty sources and already merged identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    expect(
      (
        await expectError(
          a.request(MERGE, {
            target: target.id,
            sources: pgArray([target.id]),
          }),
        )
      ).message,
    ).toContain('merge_source_is_target');
    expect((await expectError(a.request(MERGE, { target: target.id, sources: '{}' }))).message).toContain(
      'merge_sources_required',
    );
    await a.request(MERGE, {
      target: target.id,
      sources: pgArray([source.id]),
    });
    expect(
      (
        await expectError(
          a.request(MERGE, {
            target: target.id,
            sources: pgArray([source.id]),
          }),
        )
      ).message,
    ).toContain('identity_already_merged');
  });
});

describe('rollback_merge', () => {
  it('should move back exactly the recorded rows, keep newer target rows and restore statuses', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentityAsAdmin(orgA.id, { status: 'verified' });
    const own = await addPhotoAndEmbedding(user.id, orgA.id, target.id, 0);
    const moved = await addPhotoAndEmbedding(user.id, orgA.id, source.id, 1);
    const merge = (
      await a.request<Merged>(MERGE, {
        target: target.id,
        sources: pgArray([source.id]),
      })
    ).merge_identities[0];

    const newer = await addPhoto(user.id, orgA.id, target.id);
    const newerEmbedding = await addEmbedding(orgA.id, target.id, axis(3), 0.5);
    const rolled = await a.request<{
      rollback_merge: {
        id: string;
        status: string;
        rolled_back_by: string;
        rolled_back_at: string;
      }[];
    }>(ROLLBACK, { id: merge.id });
    expect(rolled.rollback_merge[0]).toMatchObject({
      id: merge.id,
      status: 'rolled_back',
      rolled_back_by: user.id,
    });
    expect(rolled.rollback_merge[0].rolled_back_at).not.toBeNull();

    const owned = await owners([target.id, source.id]);
    expect(owned).toEqual({
      [own.photo]: target.id,
      [own.embedding]: target.id,
      [newer]: target.id,
      [newerEmbedding]: target.id,
      [moved.photo]: source.id,
      [moved.embedding]: source.id,
    });
    expect((await identityState(source.id)).status).toBe('verified');
    const sourceTemplates = await runSqlRows(
      `select is_template::text as t from itap.identity_embeddings where id = '${moved.embedding}'`,
    );
    expect(sourceTemplates[0].t).toBe('true');
    expect((await auditRows(merge.id)).map((r) => [r.action, r.user_id])).toEqual([
      ['merge', user.id],
      ['rollback', user.id],
    ]);
    expect((await expectError(a.request(ROLLBACK, { id: merge.id }))).message).toContain('merge_not_completed');
  });
});
