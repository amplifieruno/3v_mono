import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity, createIdentityAsAdmin } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import {
  addPhotoAndEmbedding,
  identityState,
  MERGE,
  newProfile,
  owners,
  pgArray,
  PROFILE_COUNT,
  SPLIT,
  UPDATE_IDENTITY,
} from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

type Counts = {
  profiles_by_pk: { identities_count: number; has_face: boolean };
};

describe('split_identity', () => {
  it('should create a new unverified split identity holding only the chosen rows', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const original = await createIdentityAsAdmin(orgA.id, { profile_id: p, status: 'verified' });
    const keep = await addPhotoAndEmbedding(user.id, orgA.id, original.id, 0);
    const take = await addPhotoAndEmbedding(user.id, orgA.id, original.id, 1);
    const extra = await addEmbedding(orgA.id, original.id, axis(2), 0.4);

    const split = await a.request<{
      split_identity: {
        id: string;
        code: string;
        status: string;
        source: string;
        profile_id: string | null;
      }[];
    }>(SPLIT, {
      id: original.id,
      embeddings: pgArray([take.embedding]),
      photos: pgArray([take.photo]),
    });
    expect(split.split_identity).toHaveLength(1);
    const created = split.split_identity[0];
    expect(created).toMatchObject({
      status: 'unverified',
      source: 'split',
      profile_id: null,
    });
    expect(created.code).toMatch(/^IDENTITY-\d{5}$/);
    expect(await owners([original.id, created.id])).toEqual({
      [keep.photo]: original.id,
      [keep.embedding]: original.id,
      [extra]: original.id,
      [take.photo]: created.id,
      [take.embedding]: created.id,
    });
    expect(await identityState(original.id)).toMatchObject({
      status: 'verified',
      profile_id: p,
    });
    expect((await a.request<Counts>(PROFILE_COUNT, { id: p })).profiles_by_pk.identities_count).toBe(1);
  });

  it('should refuse rows of another identity or organization and empty selections without changes', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const original = await createIdentity(user.id, orgA.id);
    const mine = await addPhotoAndEmbedding(user.id, orgA.id, original.id, 0);
    const elsewhere = await createIdentity(user.id, orgA.id);
    const theirs = await addPhotoAndEmbedding(user.id, orgA.id, elsewhere.id, 1);
    const foreign = await createIdentity(other.id, orgB.id);

    const err = await expectError(
      a.request(SPLIT, {
        id: original.id,
        embeddings: pgArray([mine.embedding, theirs.embedding]),
        photos: '{}',
      }),
    );
    expect(err.message).toContain('split_row_not_found');
    expect(
      (await expectError(a.request(SPLIT, { id: original.id, embeddings: '{}', photos: '{}' }))).message,
    ).toContain('split_rows_required');
    const err3 = await expectError(
      asOrgAdmin(other.id, orgB.id).request(SPLIT, {
        id: original.id,
        embeddings: '{}',
        photos: pgArray([mine.photo]),
      }),
    );
    expect(err3.message).toContain('identity_not_found');
    expect(foreign.id).not.toBe(original.id);
    expect(await owners([original.id])).toEqual({
      [mine.photo]: original.id,
      [mine.embedding]: original.id,
    });
    const count = await runSqlRows(`select count(*) as n from itap.identities where organization_id = '${orgA.id}'`);
    expect(count[0].n).toBe('2');
  });
});

describe('reserved identity status and sources', () => {
  it('should reject direct moves into or out of merged and the merge/split sources', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const err = await expectError(
      a.request(UPDATE_IDENTITY, {
        id: identity.id,
        set: { status: 'merged' },
      }),
    );
    expect(err.message).toContain('identity_status_reserved:merged');
    for (const source of ['merge', 'split']) {
      const insertErr = await expectError(
        a.request(`mutation($o: identities_insert_input!) { insert_identities_one(object: $o) { id } }`, {
          o: { source },
        }),
      );
      expect(insertErr.message).toContain(`identity_source_reserved:${source}`);
    }
    await expect(runSql(`update itap.identities set status = 'merged' where id = '${identity.id}'`)).rejects.toThrow(
      /identity_status_reserved:merged/,
    );

    const target = await createIdentity(user.id, orgA.id);
    await a.request(MERGE, {
      target: target.id,
      sources: pgArray([identity.id]),
    });
    const outErr = await expectError(
      a.request(UPDATE_IDENTITY, {
        id: identity.id,
        set: { status: 'verified' },
      }),
    );
    expect(outErr.message).toContain('identity_status_reserved:merged');
  });

  it('should not leak the merge context to later mutations of the same request', async () => {
    const { orgA, user } = await createTwoOrgs();
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    const bystander = await createIdentity(user.id, orgA.id);
    const err = await expectError(
      asOrgAdmin(user.id, orgA.id).request(
        `mutation($t: uuid!, $s: _uuid!, $b: uuid!) {
          merge_identities(args: { p_target: $t, p_sources: $s }) { id }
          update_identities(where: { id: { _eq: $b } }, _set: { status: merged }) { affected_rows }
        }`,
        { t: target.id, s: pgArray([source.id]), b: bystander.id },
      ),
    );
    expect(err.message).toContain('identity_status_reserved:merged');
    expect((await identityState(bystander.id)).status).toBe('unverified');
    expect((await identityState(source.id)).status).toBe('unverified');
  });

  it('should freeze the profile link of a merged identity', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p = await newProfile(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    await a.request(MERGE, { target: target.id, sources: pgArray([source.id]) });
    const err = await expectError(a.request(UPDATE_IDENTITY, { id: source.id, set: { profile_id: p } }));
    expect(err.message).toContain('identity_merged_frozen');
    await expect(
      runSql(`update itap.identities set profile_id = '${p}', is_primary_for_profile = true where id = '${source.id}'`),
    ).rejects.toThrow(/identity_merged_frozen/);
    expect(await identityState(source.id)).toEqual({ status: 'merged', profile_id: null, is_primary_for_profile: false });
    // Other columns stay editable.
    await a.request(UPDATE_IDENTITY, { id: source.id, set: { attributes: { note: 'merged' } } });
  });
});
