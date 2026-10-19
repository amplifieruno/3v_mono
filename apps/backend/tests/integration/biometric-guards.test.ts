import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { addPhoto, identityState, MERGE, type MergeRow, newProfile, pgArray, ROLLBACK } from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

const INSERT_CONSENT = `
  mutation($o: consent_records_insert_input!) { insert_consent_records_one(object: $o) { id } }
`;
const MATCHING = `query($id: uuid!) { identities_by_pk(id: $id) { matching_enabled } }`;

async function rowCount(identityId: string): Promise<string> {
  const [row] = await runSqlRows(
    `select ((select count(*) from itap.identity_photos where identity_id = '${identityId}')
           + (select count(*) from itap.identity_embeddings where identity_id = '${identityId}'))::text as n`,
  );
  return row.n ?? '';
}

describe('biometric insert guards', () => {
  it('should reject new photos and embeddings for an identity whose biometric consent is withdrawn', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id, { profile_id: profile });
    await a.request(INSERT_CONSENT, { o: { profile_id: profile, purpose: 'biometric_processing', status: 'withdrawn' } });

    const embedding = await expectError(addEmbedding(orgA.id, identity.id, axis(0), 0.9));
    expect(embedding.message).toContain('identity_matching_disabled');
    const photo = await expectError(addPhoto(user.id, orgA.id, identity.id));
    expect(photo.message).toContain('identity_matching_disabled');
    expect(await rowCount(identity.id)).toBe('0');
  });

  it('should reject new photos and embeddings for a merged identity', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    await a.request(MERGE, { target: target.id, sources: pgArray([source.id]) });

    const embedding = await expectError(addEmbedding(orgA.id, source.id, axis(1), 0.9));
    expect(embedding.message).toContain('identity_merged_frozen');
    const photo = await expectError(addPhoto(user.id, orgA.id, source.id));
    expect(photo.message).toContain('identity_merged_frozen');
    expect(await rowCount(source.id)).toBe('0');
    // The target still accepts rows.
    await addEmbedding(orgA.id, target.id, axis(1), 0.9);
  });
});

describe('rollback_merge and consent-driven matching', () => {
  it('should restore the target matching_enabled when rollback unlinks a profile inherited with withdrawn consent', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id, { profile_id: profile });
    await a.request(INSERT_CONSENT, { o: { profile_id: profile, purpose: 'biometric_processing', status: 'withdrawn' } });
    const target = await createIdentity(user.id, orgA.id);
    const matching = async (id: string) =>
      (await a.request<{ identities_by_pk: { matching_enabled: boolean } }>(MATCHING, { id })).identities_by_pk.matching_enabled;
    expect(await matching(target.id)).toBe(true);

    const { merge_identities: [merge] } = await a.request<{ merge_identities: MergeRow[] }>(MERGE, {
      target: target.id,
      sources: pgArray([source.id]),
    });
    expect((await identityState(target.id)).profile_id).toBe(profile);
    expect(await matching(target.id)).toBe(false);

    await a.request(ROLLBACK, { id: merge.id });
    expect((await identityState(target.id)).profile_id).toBeNull();
    expect(await matching(target.id)).toBe(true);
    // The source is linked to the withdrawn profile again and stays non-matchable.
    expect(await matching(source.id)).toBe(false);
  });
});
