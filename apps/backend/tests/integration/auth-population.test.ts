import { describe, expect, it } from 'vitest';
import { publishPolicy } from './support/accessEngine.js';
import {
  addSegmentRows,
  bind,
  countRows,
  decideWorld,
  faceIdentity,
  population,
  populationScope,
  sqlProfile,
} from './support/authDecide.js';
import { createApp } from './support/authService.js';
import { axis } from './support/faces.js';
import { createAccessPoint } from './support/facilities.js';
import { manualSegment } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

const sorted = (ids: string[]): string[] => [...ids].sort();

describe('auth_population: segments', () => {
  it('should union profile and identity segments with open membership, excluding ineligible identities', async () => {
    const w = await decideWorld();
    const idSegment = await manualSegment(w.a, 'identities');
    await bind(w.org, w.app.id, { segments: [idSegment.id] });
    const loose = await faceIdentity(w.org, [axis(1)]);
    const archived = await faceIdentity(w.org, [axis(2)], { status: 'archived' });
    const disabled = await faceIdentity(w.org, [axis(3)], { matching: false });
    const synthetic = await faceIdentity(w.org, [axis(4)], { synthetic: true });
    const noTemplate = await faceIdentity(w.org, []);
    const removed = await faceIdentity(w.org, [axis(5)]);
    const outsider = await faceIdentity(w.org, [axis(6)]);
    await addSegmentRows(w.org, idSegment.id, 'identities', [loose, archived, disabled, synthetic, noTemplate]);
    await addSegmentRows(w.org, idSegment.id, 'identities', [removed], `now() - interval '2 days'`);
    await runSql(`update itap.segment_members set removed_at = now() - interval '1 day' where identity_id = '${removed}'`);

    expect(await population(w.org, w.app.id)).toEqual(sorted([w.person, loose]));
    expect(await population(w.org, w.app.id, null, new Date(Date.now() - 36 * 3600_000).toISOString())).toEqual(
      sorted([removed]),
    );
    expect(await population(w.org, w.app.id)).not.toContain(outsider);
    const scope = await populationScope(w.org, w.app.id);
    expect(scope.segments).toEqual(expect.arrayContaining([w.segment.id, idSegment.id]));
    expect(scope.sandbox).toBe(false);
    expect(scope.sizes).toMatchObject({ matchable: 4, segments: 2, facilities: 0, union: 2, final: 2 });
  });

  it('should resolve merged and profile-linked members to their effective identities', async () => {
    const w = await decideWorld();
    const second = await faceIdentity(w.org, [axis(7)], { profile: w.profile });
    expect(await population(w.org, w.app.id)).toEqual(sorted([w.person, second]));
    // An inactive profile's identities are not authenticated.
    await runSql(`update itap.profiles set status = 'suspended' where id = '${w.profile}'`);
    expect(await population(w.org, w.app.id)).toEqual([]);
  });

  it('should give a sandbox app only synthetic identities and a production app never (Review Focus 4)', async () => {
    const w = await decideWorld();
    const sandbox = await createApp(w.a, { is_sandbox: true });
    const idSegment = await manualSegment(w.a, 'identities');
    const synthetic = await faceIdentity(w.org, [axis(8)], { synthetic: true });
    const production = await faceIdentity(w.org, [axis(9)]);
    await addSegmentRows(w.org, idSegment.id, 'identities', [synthetic, production]);
    await bind(w.org, sandbox.id, { segments: [idSegment.id, w.segment.id], modes: ['identification'] });
    await bind(w.org, w.app.id, { segments: [idSegment.id] });
    expect(await population(w.org, sandbox.id)).toEqual([synthetic]);
    expect(await population(w.org, w.app.id)).toEqual(sorted([w.person, production]));
    expect((await populationScope(w.org, sandbox.id)).sandbox).toBe(true);
  });

  it('should refuse an unknown application and one of another organization', async () => {
    const w = await decideWorld();
    await expect(population(w.orgB.id, w.app.id)).rejects.toThrow(/client_application_not_found/);
  });
});

describe('auth_population: facilities, access point, work schedules', () => {
  it('should include granted / policy-covered profiles and identities seen in the facility within 30 days', async () => {
    const w = await decideWorld();
    const app = await createApp(w.a);
    await bind(w.org, app.id, { facilities: [w.facility.id], modes: ['identification'] });
    const granted = await sqlProfile(w.org);
    const grantedFace = await faceIdentity(w.org, [axis(10)], { profile: granted });
    await runSql(`insert into itap.access_grants (organization_id, profile_id, access_point_id, valid_from, valid_until, reason)
      values ('${w.org}', '${granted}', '${w.door.id}', now() - interval '1 hour', now() + interval '1 hour', 'Test')`);
    const contractor = await sqlProfile(w.org, { profile_type: 'contractor' });
    const contractorFace = await faceIdentity(w.org, [axis(11)], { profile: contractor });
    await publishPolicy(w, { profile_type: 'contractor' }, { facility_id: w.facility.id });
    const seen = await faceIdentity(w.org, [axis(12)]);
    const stale = await faceIdentity(w.org, [axis(13)]);
    await runSql(`insert into itap.tracking_sessions (organization_id, identity_id, facility_id, status, started_at, ended_at, last_detected_at)
      values ('${w.org}', '${seen}', '${w.facility.id}', 'completed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '1 hour'),
             ('${w.org}', '${stale}', '${w.facility.id}', 'completed', now() - interval '40 days', now() - interval '40 days' + interval '1 hour', now() - interval '40 days' + interval '1 hour')`);

    expect(await population(w.org, app.id)).toEqual(sorted([grantedFace, contractorFace, seen]));
    const scope = await populationScope(w.org, app.id);
    expect(scope.facilities).toEqual([w.facility.id]);
    expect(scope.sizes).toMatchObject({ segments: 0, facilities: 3, final: 3 });
  });

  it('should narrow to people the access engine allows at a bound access point, without recording', async () => {
    const w = await decideWorld();
    const other = await sqlProfile(w.org);
    const otherFace = await faceIdentity(w.org, [axis(14)], { profile: other });
    await addSegmentRows(w.org, w.segment.id, 'profiles', [other]);
    const unbound = await createAccessPoint(w.a, w.facility.id, w.area.id);
    await bind(w.org, w.app.id, { accessPoints: [w.door.id] });
    await runSql(`insert into itap.access_grants (organization_id, profile_id, access_point_id, valid_from, valid_until, reason)
      values ('${w.org}', '${w.profile}', '${w.door.id}', now() - interval '1 hour', now() + interval '1 hour', 'Test')`);

    expect(await population(w.org, w.app.id)).toEqual(sorted([w.person, otherFace]));
    expect(await population(w.org, w.app.id, w.door.id)).toEqual([w.person]);
    await expect(population(w.org, w.app.id, unbound.id)).rejects.toThrow(/access_point_not_bound/);
    expect(await countRows('access_decisions', `organization_id = '${w.org}'`)).toBe(0);
    const scope = await populationScope(w.org, w.app.id, w.door.id);
    expect(scope.access_point_id).toBe(w.door.id);
    expect(scope.sizes).toMatchObject({ union: 2, after_schedule: 2, after_access_point: 1, final: 1 });
  });

  it('should keep only rostered profiles when the app uses work schedules', async () => {
    const w = await decideWorld({ use_work_schedules: true });
    const [ws] = await runSqlRows(`insert into itap.work_schedules (organization_id, name, timezone, windows)
      values ('${w.org}', 'Always ${Date.now()}', 'UTC', '[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"24:00"}]') returning id`);
    const idSegment = await manualSegment(w.a, 'identities');
    const loose = await faceIdentity(w.org, [axis(15)]);
    await addSegmentRows(w.org, idSegment.id, 'identities', [loose]);
    await bind(w.org, w.app.id, { segments: [idSegment.id] });
    expect(await population(w.org, w.app.id)).toEqual([]);
    await runSql(`update itap.profiles set work_schedule_id = '${ws.id}' where id = '${w.profile}'`);
    expect(await population(w.org, w.app.id)).toEqual([w.person]);
    expect((await populationScope(w.org, w.app.id)).use_work_schedules).toBe(true);
  });
});
