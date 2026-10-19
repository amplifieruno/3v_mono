import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { identityState, MERGE, newProfile, pgArray, UPDATE_IDENTITY } from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

const INSERT_CONSENT = `
  mutation($o: consent_records_insert_input!) { insert_consent_records_one(object: $o) { id status withdrawn_at } }
`;
const UPDATE_CONSENT = `
  mutation($id: uuid!, $set: consent_records_set_input!) {
    update_consent_records_by_pk(pk_columns: { id: $id }, _set: $set) { id status }
  }
`;
const DELETE_CONSENT = `mutation($id: uuid!) { delete_consent_records_by_pk(id: $id) { id } }`;
const MATCH = `
  query($e: String!) { match_face(args: { p_embedding: $e }) { identity_id } }
`;
const MATCHING = `query($id: uuid!) { identities_by_pk(id: $id) { matching_enabled } }`;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

async function consent(client: HasuraClient, profileId: string, fields: Record<string, unknown>) {
  const data = await client.request<{ insert_consent_records_one: { id: string; status: string; withdrawn_at: string | null } }>(
    INSERT_CONSENT,
    { o: { profile_id: profileId, purpose: 'biometric_processing', ...fields } },
  );
  return data.insert_consent_records_one;
}

async function matchingEnabled(client: HasuraClient, id: string): Promise<boolean> {
  return (await client.request<{ identities_by_pk: { matching_enabled: boolean } }>(MATCHING, { id })).identities_by_pk
    .matching_enabled;
}

async function matches(client: HasuraClient, identityId: string): Promise<boolean> {
  const data = await client.request<{ match_face: { identity_id: string }[] }>(MATCH, { e: vectorLiteral(axis(0)) });
  return data.match_face.some((m) => m.identity_id === identityId);
}

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const profile = await newProfile(user.id, orgA.id);
  const identity = await createIdentity(user.id, orgA.id, { profile_id: profile });
  await addEmbedding(orgA.id, identity.id, axis(0), 0.9);
  return { orgA, orgB, user, other, a, profile, identity };
}

describe('biometric consent effects', () => {
  it('should disable matching on withdrawal and re-enable it on re-grant', async () => {
    const { a, profile, identity } = await setup();
    expect(await matches(a, identity.id)).toBe(true);

    const grant = await consent(a, profile, { status: 'granted', granted_at: day(-2), method: 'paper' });
    expect(await matchingEnabled(a, identity.id)).toBe(true);

    await a.request(UPDATE_CONSENT, { id: grant.id, set: { status: 'withdrawn', withdrawn_at: day(-1) } });
    expect(await matchingEnabled(a, identity.id)).toBe(false);
    expect(await matches(a, identity.id)).toBe(false);

    await consent(a, profile, { status: 'granted', granted_at: day(0) });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
    expect(await matches(a, identity.id)).toBe(true);
  });

  it('should default withdrawn_at to now for a withdrawn record without one', async () => {
    const { a, profile, identity } = await setup();
    const withdrawn = await consent(a, profile, { status: 'withdrawn' });
    expect(withdrawn.withdrawn_at).not.toBeNull();
    expect(await matchingEnabled(a, identity.id)).toBe(false);
  });

  it('should let the latest record decide, by effective time, not insertion order', async () => {
    const { a, profile, identity } = await setup();
    await consent(a, profile, { status: 'granted', granted_at: day(-1) });
    // Backdated withdrawal: older than the grant, so it must not win.
    await consent(a, profile, { status: 'withdrawn', granted_at: day(-5), withdrawn_at: day(-3) });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
    // A newer withdrawal wins.
    await consent(a, profile, { status: 'withdrawn', granted_at: day(-5), withdrawn_at: day(0) });
    expect(await matchingEnabled(a, identity.id)).toBe(false);
  });

  it('should enable matching again when the withdrawing record is deleted or flipped back to granted', async () => {
    const { a, profile, identity } = await setup();
    const withdrawn = await consent(a, profile, { status: 'withdrawn' });
    expect(await matchingEnabled(a, identity.id)).toBe(false);
    await a.request(UPDATE_CONSENT, { id: withdrawn.id, set: { status: 'granted', withdrawn_at: null } });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
    await a.request(UPDATE_CONSENT, { id: withdrawn.id, set: { status: 'withdrawn' } });
    expect(await matchingEnabled(a, identity.id)).toBe(false);
    await a.request(DELETE_CONSENT, { id: withdrawn.id });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
  });

  it('should ignore purposes other than biometric_processing', async () => {
    const { a, profile, identity } = await setup();
    await consent(a, profile, { purpose: 'marketing', status: 'withdrawn' });
    await consent(a, profile, { purpose: 'tracking', status: 'withdrawn' });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
  });

  it('should disable matching for identities linked later to a profile with withdrawn consent', async () => {
    const { a, user, orgA, profile } = await setup();
    await consent(a, profile, { status: 'withdrawn' });

    const created = await createIdentity(user.id, orgA.id, { profile_id: profile });
    expect(await matchingEnabled(a, created.id)).toBe(false);

    const unlinked = await createIdentity(user.id, orgA.id);
    expect(await matchingEnabled(a, unlinked.id)).toBe(true);
    await a.request(UPDATE_IDENTITY, { id: unlinked.id, set: { profile_id: profile } });
    expect(await matchingEnabled(a, unlinked.id)).toBe(false);

    // Moving to a profile without a withdrawal restores matching.
    const clean = await newProfile(user.id, orgA.id);
    await a.request(UPDATE_IDENTITY, { id: unlinked.id, set: { profile_id: clean } });
    expect(await matchingEnabled(a, unlinked.id)).toBe(true);
  });

  it('should only affect identities of the consenting profile', async () => {
    const { a, user, orgA, profile } = await setup();
    const otherProfile = await newProfile(user.id, orgA.id);
    const bystander = await createIdentity(user.id, orgA.id, { profile_id: otherProfile });
    await consent(a, profile, { status: 'withdrawn' });
    expect(await matchingEnabled(a, bystander.id)).toBe(true);
  });

  it('should leave merged identities untouched (they carry no profile) and disable their surviving target', async () => {
    const { a, user, orgA, profile, identity } = await setup();
    const target = await createIdentity(user.id, orgA.id);
    await a.request(MERGE, { target: target.id, sources: pgArray([identity.id]) });
    expect((await identityState(identity.id)).status).toBe('merged');
    await consent(a, profile, { status: 'withdrawn' });
    expect(await matchingEnabled(a, identity.id)).toBe(true);
    expect(await matchingEnabled(a, target.id)).toBe(false);
  });

  it('should refuse consent for a profile of another organization', async () => {
    const { a, other, orgB } = await setup();
    const foreign = await newProfile(other.id, orgB.id);
    const error = await expectError(consent(a, foreign, { status: 'granted' }));
    expect(error.message).toMatch(/foreign key|violates/i);
  });

  it('should reject unknown purposes and a granted record carrying withdrawn_at', async () => {
    const { a, profile } = await setup();
    await expectError(consent(a, profile, { purpose: 'selling' }));
    await expectError(consent(a, profile, { status: 'granted', withdrawn_at: day(0) }));
  });

  it('should audit consent changes with the caller', async () => {
    const { a, user, orgA, profile } = await setup();
    const record = await consent(a, profile, { status: 'withdrawn' });
    const rows = await runSqlRows(
      `select action, user_id::text from itap.audit_log where organization_id = '${orgA.id}' and entity = 'consent_records' and entity_id = '${record.id}'`,
    );
    expect(rows).toEqual([{ action: 'insert', user_id: user.id }]);
  });
});
