import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin, asUser } from './support/clients.js';
import { addEmbedding, asAdminWithSession, atDistance, axis, createIdentity, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectDenied } from './support/fixtures.js';
import { runSql } from './support/sql.js';

const MATCH = `
  query Match($embedding: String!, $threshold: Float, $limit: Int) {
    match_face(args: { p_embedding: $embedding, p_threshold: $threshold, p_limit: $limit }) {
      organization_id identity_id profile_id distance similarity
    }
  }
`;

type Match = { organization_id: string; identity_id: string; profile_id: string | null; distance: number; similarity: number };

async function match(client: HasuraClient, values: number[], threshold?: number, limit?: number): Promise<Match[]> {
  const data = await client.request<{ match_face: Match[] }>(MATCH, {
    embedding: vectorLiteral(values),
    ...(threshold === undefined ? {} : { threshold }),
    ...(limit === undefined ? {} : { limit }),
  });
  return data.match_face;
}

/** Org A with one identity enrolled on axis 0 (linked to a profile); org B with an org admin. */
async function enrolledPair() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const profile = await asOrgAdmin(user.id, orgA.id).request<{ insert_profiles_one: { id: string } }>(
    `mutation { insert_profiles_one(object: { first_name: "Ann", last_name: "Lee" }) { id } }`,
  );
  const identity = await createIdentity(user.id, orgA.id, { profile_id: profile.insert_profiles_one.id });
  await addEmbedding(orgA.id, identity.id, axis(0), 0.9);
  return { orgA, orgB, user, other, identity, profileId: profile.insert_profiles_one.id };
}

describe('match_face', () => {
  it('should return the enrolled identity for an identical embedding with distance about 0', async () => {
    const { orgA, user, identity, profileId } = await enrolledPair();
    const result = await match(asOrgAdmin(user.id, orgA.id), axis(0));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ organization_id: orgA.id, identity_id: identity.id, profile_id: profileId });
    expect(result[0].distance).toBeCloseTo(0, 5);
    expect(result[0].similarity).toBeCloseTo(1, 5);
  });

  it('should never match a face enrolled in another organization', async () => {
    const { orgA, orgB, other } = await enrolledPair();
    expect(await match(asOrgAdmin(other.id, orgB.id), axis(0))).toEqual([]);
    // Admin secret with forwarded headers is scoped to the forwarded organization.
    expect(await match(asAdminWithSession(orgB.id), axis(0))).toEqual([]);
    expect(await match(asAdminWithSession(orgA.id), axis(0))).toHaveLength(1);
    // Admin secret without an organization id: no rows, never all organizations.
    expect(await match(asAdminWithSession(), axis(0))).toEqual([]);
  });

  it('should not be exposed to the base user role', async () => {
    const { user } = await enrolledPair();
    await expectDenied(match(asUser(user.id), axis(0)), 'match_face');
  });

  it('should hide the face_matches result table root fields from org_admin', async () => {
    const { orgA, user } = await enrolledPair();
    await expectDenied(asOrgAdmin(user.id, orgA.id).request(`query { face_matches { identity_id } }`), 'face_matches');
  });

  it('should exclude identities with matching disabled, merged or archived', async () => {
    const { orgA, user, identity } = await enrolledPair();
    const a = asOrgAdmin(user.id, orgA.id);
    await runSql(`update itap.identities set matching_enabled = false where id = '${identity.id}'`);
    expect(await match(a, axis(0))).toEqual([]);
    // merged is reserved for the merge functions; set the transaction-local merge context like they do.
    await runSql(
      `select set_config('itap.merge_context', 'on', true); update itap.identities set matching_enabled = true, status = 'merged' where id = '${identity.id}'`,
    );
    expect(await match(a, axis(0))).toEqual([]);
    await runSql(
      `select set_config('itap.merge_context', 'on', true); update itap.identities set status = 'archived' where id = '${identity.id}'`,
    );
    expect(await match(a, axis(0))).toEqual([]);
    await runSql(`update itap.identities set status = 'verified' where id = '${identity.id}'`);
    expect(await match(a, axis(0))).toHaveLength(1);
  });

  it('should respect an explicit threshold and default to the organization recognition_threshold', async () => {
    const { orgA, user } = await enrolledPair();
    const a = asOrgAdmin(user.id, orgA.id);
    const probe = atDistance(0, 1, 0.3);
    expect(await match(a, probe, 0.2)).toEqual([]);
    const hit = await match(a, probe, 0.4);
    expect(hit).toHaveLength(1);
    expect(hit[0].distance).toBeCloseTo(0.3, 4);
    expect(await match(a, probe)).toHaveLength(1); // default 0.5
    await runSql(`update itap.organization_settings set recognition_threshold = 0.25 where organization_id = '${orgA.id}'`);
    expect(await match(a, probe)).toEqual([]);
  });

  it('should match templates only, return one row per identity ordered by distance, and honour the limit', async () => {
    const { orgA, user, identity } = await enrolledPair();
    const a = asOrgAdmin(user.id, orgA.id);
    // Second template of the same identity close to the probe: still one row, best distance.
    await addEmbedding(orgA.id, identity.id, atDistance(0, 2, 0.1), 0.8);
    const near = await createIdentity(user.id, orgA.id);
    await addEmbedding(orgA.id, near.id, atDistance(0, 3, 0.2), 0.9);

    const result = await match(a, axis(0), 0.5);
    expect(result.map((r) => r.identity_id)).toEqual([identity.id, near.id]);
    expect(result[0].distance).toBeCloseTo(0, 5);
    expect(await match(a, axis(0), 0.5, 1)).toHaveLength(1);

    // A non-template embedding (sixth, lowest quality) is never matched.
    const hidden = await createIdentity(user.id, orgA.id);
    for (let i = 0; i < 5; i += 1) await addEmbedding(orgA.id, hidden.id, axis(100 + i), 0.9);
    await addEmbedding(orgA.id, hidden.id, axis(200), 0.1);
    expect(await match(a, axis(200), 0.5)).toEqual([]);
  });
});
