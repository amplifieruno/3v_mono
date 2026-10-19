import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { INSERT_FACILITY } from './support/facilities.js';
import { createIdentityAsAdmin } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { MERGE, pgArray } from './support/lifecycle.js';
import { results, searchFaces } from './support/search.js';
import { runSql } from './support/sql.js';

/** Attribute-only search (slice 7, task 3): every filter, ordering by last_seen_at desc, isolation. */

beforeAll(requireBackend);

const day = (d: number): string => new Date(Date.UTC(2030, 0, d, 12)).toISOString();

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const { insert_companies_one: company } = await a.request<{ insert_companies_one: { id: string } }>(
    `mutation { insert_companies_one(object: { name: "Acme", kind: tenant }) { id } }`,
  );
  const profile = async (profileType: string, companyId?: string) =>
    (
      await a.request<{ insert_profiles_one: { id: string } }>(
        `mutation ($o: profiles_insert_input!) { insert_profiles_one(object: $o) { id } }`,
        { o: { first_name: 'P', last_name: profileType, profile_type: profileType, company_id: companyId ?? null } },
      )
    ).insert_profiles_one.id;
  const { insert_facilities_one: facility } = await a.request<{ insert_facilities_one: { id: string } }>(INSERT_FACILITY, {
    object: { name: 'HQ', timezone: 'UTC' },
  });

  const identity = async (object: Record<string, unknown>, firstSeen: number, lastSeen: number) => {
    const { id } = await createIdentityAsAdmin(orgA.id, object);
    await runSql(`UPDATE itap.identities SET first_seen_at = '${day(firstSeen)}', last_seen_at = '${day(lastSeen)}' WHERE id = '${id}'`);
    return id;
  };
  // employee at Acme, female 30, seen at HQ on day 5
  const emp = await identity({ profile_id: await profile('employee', company.id), attributes: { gender: 'female', age: 30 } }, 1, 5);
  // visitor, male 45
  const vis = await identity({ profile_id: await profile('visitor'), attributes: { gender: 'male', age: 45 } }, 3, 9);
  // unknown (unlinked), suspended, female 22
  const unk = await identity({ status: 'suspended', attributes: { gender: 'female', age: 22 } }, 8, 8);
  await runSql(`
    INSERT INTO itap.tracking_sessions (organization_id, identity_id, facility_id, status, started_at, ended_at, last_detected_at)
    VALUES ('${orgA.id}', '${emp}', '${facility.id}', 'completed', '${day(5)}', '${new Date(Date.parse(day(5)) + 3600_000).toISOString()}',
            '${new Date(Date.parse(day(5)) + 3600_000).toISOString()}')`);
  return { orgA, orgB, user, other, a, company: company.id, facility: facility.id, emp, vis, unk };
}

type World = Awaited<ReturnType<typeof world>>;

async function find(w: World, filters: Record<string, unknown>): Promise<string[]> {
  const out = await searchFaces(w.a, { search_type: 'attribute', filters });
  expect(out).toMatchObject({ status: 'completed', top_confidence: null, face_count: null });
  const rows = await results(out.search_request_id);
  expect(rows.every((r) => r.confidence === null && r.match_type === 'exact')).toBe(true);
  return rows.map((r) => r.identity_id ?? '');
}

describe('search_faces (attribute)', () => {
  it('should list every identity by last_seen_at desc without filters', async () => {
    const w = await world();
    expect(await find(w, {})).toEqual([w.vis, w.unk, w.emp]);
  });

  it('should filter by status, link, profile type and company', async () => {
    const w = await world();
    expect(await find(w, { status: ['suspended'] })).toEqual([w.unk]);
    expect(await find(w, { linked: false })).toEqual([w.unk]);
    expect(await find(w, { linked: true })).toEqual([w.vis, w.emp]);
    expect(await find(w, { profile_type: ['employee', 'contractor'] })).toEqual([w.emp]);
    expect(await find(w, { company_id: w.company })).toEqual([w.emp]);
  });

  it('should filter by gender and age range', async () => {
    const w = await world();
    expect(await find(w, { gender: 'female' })).toEqual([w.unk, w.emp]);
    expect(await find(w, { age_min: 25, age_max: 50 })).toEqual([w.vis, w.emp]);
    expect(await find(w, { gender: 'female', age_max: 25 })).toEqual([w.unk]);
  });

  it('should filter by first and last seen ranges', async () => {
    const w = await world();
    expect(await find(w, { first_seen_from: day(2), first_seen_to: day(8) })).toEqual([w.vis, w.unk]);
    expect(await find(w, { last_seen_to: day(6) })).toEqual([w.emp]);
    expect(await find(w, { last_seen_from: day(8) })).toEqual([w.vis, w.unk]);
  });

  it('should filter by the facility an identity was seen in (tracking sessions), optionally in a window', async () => {
    const w = await world();
    expect(await find(w, { facility_id: w.facility })).toEqual([w.emp]);
    expect(await find(w, { facility_id: w.facility, seen_from: day(4), seen_to: day(6) })).toEqual([w.emp]);
    expect(await find(w, { facility_id: w.facility, seen_from: day(6) })).toEqual([]);
  });

  it('should find a merge target through the history of its merged sources (effective identity)', async () => {
    const w = await world();
    const { id: target } = await createIdentityAsAdmin(w.orgA.id, {});
    await w.a.request(MERGE, { target, sources: pgArray([w.emp]), reason: 'same person' });
    // emp (now merged) was first seen on day 1, last on day 5, in facility HQ; the target itself was never seen.
    expect(await find(w, { facility_id: w.facility })).toEqual([target]);
    expect(await find(w, { facility_id: w.facility, seen_from: day(4), seen_to: day(6) })).toEqual([target]);
    expect(await find(w, { first_seen_to: day(2) })).toEqual([target]);
    expect(await find(w, { last_seen_from: day(4), last_seen_to: day(6) })).toEqual([target]);
    expect(await find(w, {})).toEqual([w.vis, w.unk, target]);
  });

  it('should exclude merged identities and identities whose biometric consent was withdrawn', async () => {
    const w = await world();
    await runSql(`UPDATE itap.identities SET matching_enabled = false WHERE id = '${w.vis}'`);
    await runSql(`SELECT set_config('itap.merge_context', 'on', true); UPDATE itap.identities SET status = 'merged' WHERE id = '${w.unk}'`);
    expect(await find(w, {})).toEqual([w.emp]);
  });

  it('should reject malformed filters and references outside the organization', async () => {
    const w = await world();
    for (const filters of [
      { unknown_key: 1 },
      { status: 'active' },
      { status: ['no_such_status'] },
      { age_min: -1 },
      { age_min: 40, age_max: 30 },
      { last_seen_from: 'yesterday' },
      { last_seen_from: '2030-01-01T00:00:00' },
      { company_id: 'not-a-uuid' },
    ]) {
      expect((await expectError(searchFaces(w.a, { search_type: 'attribute', filters }))).code).toBe('invalid_filters');
    }
    // A facility of another organization.
    const { insert_facilities_one: foreign } = await asOrgAdmin(w.other.id, w.orgB.id).request<{
      insert_facilities_one: { id: string };
    }>(INSERT_FACILITY, { object: { name: 'B', timezone: 'UTC' } });
    expect(
      (await expectError(searchFaces(w.a, { search_type: 'attribute', filters: { facility_id: foreign.id } }))).code,
    ).toBe('invalid_filters');
  });

  it("should never return another organization's identities", async () => {
    const w = await world();
    const out = await searchFaces(asOrgAdmin(w.other.id, w.orgB.id), { search_type: 'attribute', filters: {} });
    expect(out.results_count).toBe(0);
  });
});
