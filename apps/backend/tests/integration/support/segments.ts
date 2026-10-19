import type { HasuraClient } from '../../../src/hasura/client.js';
import { createHasuraClient } from '../../../src/hasura/client.js';
import { asOrgAdmin, testEnv } from './clients.js';
import { createArea, createFacility } from './facilities.js';
import { insertOne } from './operations.js';
import { runSqlRows } from './sql.js';
import { createTrackingWorld } from './tracking.js';

/** Segment test helpers (slice 6). */

export type Segment = {
  id: string;
  code: string;
  kind: string;
  target: string;
  status: string;
  conditions: Record<string, unknown>;
  member_count: number;
  last_evaluated_at: string | null;
  updated_at: string;
};
export const SEGMENT_FIELDS = 'id code kind target status conditions member_count last_evaluated_at updated_at';

export type Member = {
  id: string;
  segment_id: string;
  target: string;
  identity_id: string | null;
  profile_id: string | null;
  source: string;
  added_by: string | null;
  added_at: string;
  removed_at: string | null;
  removed_by: string | null;
};
export const MEMBER_FIELDS = 'id segment_id target identity_id profile_id source added_by added_at removed_at removed_by';

/** Tracking world (org A with facility/areas/cameras/identity) plus an org B area and admin client. */
export async function segmentWorld() {
  const w = await createTrackingWorld();
  const b = asOrgAdmin(w.other.id, w.orgB.id);
  const facilityB = await createFacility(b);
  const areaB = await createArea(b, facilityB.id, 'B lobby', null);
  return { ...w, b, facilityB, areaB };
}
export type SegmentWorld = Awaited<ReturnType<typeof segmentWorld>>;

let counter = 0;
const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}-${(counter += 1)}`;

export async function createSegment(client: HasuraClient, object: Record<string, unknown>): Promise<Segment> {
  return insertOne<Segment>(client, 'segments', { name: uniqueName('Segment'), ...object }, SEGMENT_FIELDS);
}

export const manualSegment = (client: HasuraClient, target = 'profiles', extra: Record<string, unknown> = {}) =>
  createSegment(client, { kind: 'manual', target, ...extra });

export const dynamicSegment = (client: HasuraClient, target: string, conditions: unknown, extra: Record<string, unknown> = {}) =>
  createSegment(client, { kind: 'dynamic', target, conditions, ...extra });

export async function createProfile(client: HasuraClient, extra: Record<string, unknown> = {}): Promise<string> {
  return (await insertOne(client, 'profiles', { first_name: 'Test', last_name: uniqueName('Person'), ...extra })).id;
}

const pgArray = (ids: string[]): string => `{${ids.join(',')}}`;

export async function addMembers(client: HasuraClient, segment: string, ids: string[]): Promise<Member[]> {
  const data = await client.request<{ add_segment_members: Member[] }>(
    `mutation($s: uuid!, $ids: _uuid!) { add_segment_members(args: {p_segment: $s, p_ids: $ids}) { ${MEMBER_FIELDS} } }`,
    { s: segment, ids: pgArray(ids) },
  );
  return data.add_segment_members;
}

export async function removeMembers(client: HasuraClient, segment: string, ids: string[]): Promise<Member[]> {
  const data = await client.request<{ remove_segment_members: Member[] }>(
    `mutation($s: uuid!, $ids: _uuid!) { remove_segment_members(args: {p_segment: $s, p_ids: $ids}) { ${MEMBER_FIELDS} } }`,
    { s: segment, ids: pgArray(ids) },
  );
  return data.remove_segment_members;
}

/** All membership rows of a segment (SQL, ordered by added_at then source). */
export async function memberRows(segment: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `SELECT coalesce(identity_id, profile_id) AS subject, source, added_by, removed_by,
            (removed_at IS NULL)::text AS active
     FROM itap.segment_members WHERE segment_id = '${segment}' ORDER BY added_at, source DESC, id`,
  );
}

export async function memberCount(segment: string): Promise<number> {
  const [row] = await runSqlRows(`SELECT member_count FROM itap.segments WHERE id = '${segment}'`);
  return Number(row.member_count);
}

/** Simulates the evaluator (task 2): inserts active rule rows (dynamic segments only; manual ones refuse them). */
export async function insertRuleRows(org: string, segment: string, column: 'identity_id' | 'profile_id', ids: string[]): Promise<void> {
  const target = column === 'identity_id' ? 'identities' : 'profiles';
  const values = ids.map((id) => `('${org}', '${segment}', '${target}', '${id}', 'rule')`).join(', ');
  await runSqlRows(`INSERT INTO itap.segment_members (organization_id, segment_id, target, ${column}, source) VALUES ${values}`);
}

/** Merges `sources` into `target` (merge_identities); returns the merge id. */
export async function mergeInto(client: HasuraClient, target: string, sources: string[]): Promise<string> {
  const data = await client.request<{ merge_identities: { id: string }[] }>(
    `mutation($t: uuid!, $s: _uuid!) { merge_identities(args: {p_target: $t, p_sources: $s}) { id } }`,
    { t: target, s: pgArray(sources) },
  );
  return data.merge_identities[0].id;
}

export async function rollbackMerge(client: HasuraClient, merge: string): Promise<void> {
  await client.request(`mutation($id: uuid!) { rollback_merge(args: {p_merge_id: $id}) { id } }`, { id: merge });
}

/** Membership rows of a segment with exact ids and times (for before/after comparisons). */
export async function exactRows(segment: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `SELECT id, coalesce(identity_id, profile_id) AS subject, source, added_by, added_at, removed_at, removed_by
     FROM itap.segment_members WHERE segment_id = '${segment}' ORDER BY id`,
  );
}

export type EvaluateResult = {
  segment_id: string;
  added: number;
  removed: number;
  member_count: number;
  evaluated_at: string;
  stale: boolean;
};
export type PreviewResult = { count: number; sample_ids: string[]; sample_labels: string[] };

/** Action evaluate_segment (org_admin). */
export async function evaluate(client: HasuraClient, segment: string): Promise<EvaluateResult> {
  const data = await client.request<{ evaluate_segment: EvaluateResult }>(
    `mutation($id: uuid!) { evaluate_segment(segment_id: $id) { segment_id added removed member_count evaluated_at stale } }`,
    { id: segment },
  );
  return data.evaluate_segment;
}

/** Action preview_segment (org_admin). */
export async function preview(client: HasuraClient, target: string, conditions: unknown, limit?: number): Promise<PreviewResult> {
  const data = await client.request<{ preview_segment: PreviewResult }>(
    `query($t: String!, $c: jsonb!, $l: Int) { preview_segment(target: $t, conditions: $c, limit: $l) { count sample_ids sample_labels } }`,
    { t: target, c: conditions, l: limit },
  );
  return data.preview_segment;
}

export type SyncResult = { added: number; removed: number; member_count: number; stale: boolean };

/** itap.sync_segment_members through Hasura (admin secret + organization session, like the backend actor). */
export async function syncMembers(client: HasuraClient, segment: string, ids: string[], when: string): Promise<SyncResult> {
  const data = await client.request<{ sync_segment_members: SyncResult[] }>(
    `mutation($s: uuid!, $ids: _uuid!, $at: timestamptz!) {
       sync_segment_members(args: {p_segment: $s, p_ids: $ids, p_at: $at}) { added removed member_count stale }
     }`,
    { s: segment, ids: pgArray(ids), at: when },
  );
  return data.sync_segment_members[0];
}

/** Open membership rows of a segment: [subject, source] sorted by subject. */
export async function openRows(segment: string): Promise<[string | null, string | null][]> {
  const rows = await runSqlRows(
    `SELECT coalesce(identity_id, profile_id) AS subject, source FROM itap.segment_members
     WHERE segment_id = '${segment}' AND removed_at IS NULL ORDER BY subject`,
  );
  return rows.map((r) => [r.subject, r.source]);
}

/** Admin secret with an organization session (what the backend's actor client sends). */
export function asActor(org: string, user?: string): HasuraClient {
  return createHasuraClient(testEnv(), { role: 'admin', organizationId: org, userId: user });
}
