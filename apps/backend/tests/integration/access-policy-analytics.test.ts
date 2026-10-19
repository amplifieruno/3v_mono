import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { archivePolicy } from './support/access.js';
import { accessWorld, evaluate, insertGrant, publishPolicy } from './support/accessEngine.js';
import { createAccessPoint } from './support/facilities.js';
import { expectError } from './support/fixtures.js';
import { callFn, insertOne } from './support/operations.js';

/** Policy analytics (slice 8 task 4): hit counts, denial reasons, top denied pairs, unused versions, overlaps, grants. */

type VersionHits = { version_id: string; hits: number; granted: number; denied: number; enforced: boolean; last_hit_at: string | null };
type Analytics = {
  decisions: number;
  granted: number;
  denied: number;
  versions: VersionHits[];
  unused_versions: { version_id: string }[];
  denial_reasons: { reason: string; count: number }[];
  top_denied: { profile_id: string | null; access_point_id: string; denied: number }[];
  overlap_hints: { version_a: string; version_b: string; kind: string }[];
  grants: Record<string, number>;
  complexity: Record<string, number>;
};

async function analytics(client: HasuraClient, from: string, to: string): Promise<Analytics> {
  const data = await client.request<{ policy_analytics: Analytics[] }>(
    `query($a: policy_analytics_args!) { policy_analytics(args: $a) { decisions granted denied versions unused_versions
      denial_reasons top_denied overlap_hints grants complexity } }`,
    { a: { p_from: from, p_to: to } },
  );
  return data.policy_analytics[0];
}

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

describe('policy_analytics', () => {
  it('should report hits per version, denial reasons, top denied pairs, unused versions, overlaps and grants', async () => {
    const w = await accessWorld();
    const side = await createAccessPoint(w.a, w.facility.id, w.area.id);
    const visitor = (await insertOne(w.a, 'profiles', { first_name: 'Vic', last_name: 'Visitor', profile_type: 'visitor' })).id;
    const employees = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: w.door.id });
    const sideDeny = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: side.id }, { effect: 'deny' });
    // Same subject + target sets as `employees`: a consolidation candidate; another conflicting pair below.
    const duplicate = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: w.door.id }, { priority: 200 });
    const conflict = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: side.id }, { effect: 'allow' });
    const unused = await publishPolicy(w, { profile_type: 'vip' }, { facility_id: w.facility.id });
    const archived = await publishPolicy(w, { profile_type: 'contractor' }, { facility_id: w.facility.id });

    // Decisions (all within the last 2 hours): duplicate (priority 200) decides the employee at the door.
    for (const m of [100, 90, 80]) await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: ago(m), record: true });
    for (const m of [75, 74]) await evaluate(w.orgA.id, side.id, { profile: w.profile, at: ago(m), record: true });
    for (const m of [70, 60, 50]) await evaluate(w.orgA.id, w.door.id, { profile: visitor, at: ago(m), record: true });
    await archivePolicy(w.a, archived.policy);

    // Grants: one used (reusable, grants the visitor at the side door), one unused, one expired, one revoked.
    const used = await insertGrant(w, { profile_id: visitor, access_point_id: side.id, valid_from: ago(100) });
    await evaluate(w.orgA.id, side.id, { profile: visitor, at: ago(40), record: true });
    await insertGrant(w, { profile_id: visitor, valid_from: ago(100) });
    await insertGrant(w, { profile_id: visitor, valid_from: ago(100), valid_until: ago(30) });
    const revoked = await insertGrant(w, { profile_id: visitor, valid_from: ago(100) });
    await callFn(w.a, 'revoke_access_grant', { p_grant: revoked }, 'id');

    const a = await analytics(w.a, ago(120), ago(-1));
    expect(a).toMatchObject({ decisions: 9, granted: 4, denied: 5 });
    const byVersion = Object.fromEntries(a.versions.map((v) => [v.version_id, v]));
    expect(byVersion[duplicate.version]).toMatchObject({ hits: 3, granted: 3, denied: 0, enforced: true });
    expect(byVersion[sideDeny.version]).toMatchObject({ hits: 2, granted: 0, denied: 2 });
    expect(byVersion[employees.version]).toMatchObject({ hits: 0, enforced: true });
    expect(byVersion[archived.version]).toBeUndefined();
    expect(a.unused_versions.map((v) => v.version_id).sort()).toEqual([employees.version, conflict.version, unused.version].sort());
    expect(a.denial_reasons).toEqual([
      { reason: 'no_rule', count: 3 },
      { reason: 'policy_deny', count: 2 },
    ]);
    expect(a.top_denied[0]).toMatchObject({ profile_id: visitor, access_point_id: w.door.id, denied: 3 });
    expect(a.top_denied[1]).toMatchObject({ profile_id: w.profile, access_point_id: side.id, denied: 2 });
    const pair = (x: string, y: string): string => [x, y].sort().join(',');
    expect(a.overlap_hints.map((o) => `${pair(o.version_a, o.version_b)}:${o.kind}`).sort()).toEqual(
      [`${pair(employees.version, duplicate.version)}:same_effect`, `${pair(sideDeny.version, conflict.version)}:conflicting`].sort(),
    );
    expect(a.grants).toEqual({ total: 4, used: 1, unused: 1, expired: 1, revoked: 1 });
    expect(a.complexity).toMatchObject({ enforced_policies: 5, subjects: 5, targets: 5 });
    expect(used).toBeTruthy();

    // Another organization sees none of it; a bad period is refused.
    expect(await analytics(w.b, ago(120), ago(-1))).toMatchObject({ decisions: 0, versions: [], grants: { total: 0 } });
    expect((await expectError(analytics(w.a, ago(0), ago(10)))).message).toContain('report_period_invalid');
  });
});
