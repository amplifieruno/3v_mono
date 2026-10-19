import { describe, expect, it } from 'vitest';
import { createDevice } from './support/facilities.js';
import { runSql } from './support/sql.js';
import { evaluate, orgEvents, types } from './support/stageB.js';
import { createIdentity, createTrackingWorld, detect, sessions, type World } from './support/tracking.js';

/** area_transitions_daily rows (as the aggregation writes them): [day, from area, to area, count]. */
async function seedTransitions(w: World, rows: [string, string, string, number][]): Promise<void> {
  const values = rows
    .map(([day, from, to, count]) => `('${w.orgA.id}', '${w.facility.id}', '${day}', '${from}', '${to}', ${count})`)
    .join(', ');
  await runSql(`INSERT INTO itap.area_transitions_daily (organization_id, facility_id, day, from_area_id, to_area_id, count)
    VALUES ${values} ON CONFLICT (organization_id, facility_id, day, from_area_id, to_area_id) DO UPDATE SET count = EXCLUDED.count`);
}

/** World plus a camera in "Floor 1" (the parent area of Zone A). Clock: 2026-01-05 08:00 UTC, facility in UTC. */
async function movementWorld() {
  const w = await createTrackingWorld();
  const floorAreaCam = await createDevice(w.a, w.facility.id, { area_id: w.floor.id });
  return { ...w, floorAreaCam };
}

const abnormal = (e: { event_type: string }) => e.event_type === 'abnormal_movement';

describe('Stage B: abnormal_movement', () => {
  it('should emit abnormal_movement for a rare transition between busy areas, once per session and target area', async () => {
    const w = await movementWorld();
    // 30 days before 2026-01-05: Lobby -> Zone A is common, Zone A -> Floor 1 makes Floor 1 busy, Lobby -> Floor 1 once.
    // Rows of the detection's own day and older than 30 days do not count.
    await seedTransitions(w, [
      ['2026-01-04', w.lobby.id, w.zone.id, 25],
      ['2025-12-10', w.zone.id, w.floor.id, 25],
      ['2026-01-01', w.lobby.id, w.floor.id, 1],
      ['2026-01-05', w.lobby.id, w.floor.id, 7],
      ['2025-12-05', w.lobby.id, w.floor.id, 7],
    ]);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    const entered = await detect(w.orgA.id, w.floorAreaCam, w.identity, 60);
    const events = await evaluate(entered.id);
    const [session] = await sessions(w.identity);
    expect(types(events)).toEqual(['abnormal_movement']);
    expect(events[0]).toMatchObject({
      severity: 'medium',
      area_id: w.floor.id,
      session_id: session.id,
      dedup_key: `session:${session.id}:abnormal_movement:${w.floor.id}`,
      payload: { from_area_id: w.lobby.id, to_area_id: w.floor.id, transitions_30d: 1, from_area_total: 26, to_area_total: 26 },
    });
    // Re-evaluation and a second entry into Floor 1 in the same session add nothing.
    expect(types(await evaluate(entered.id))).toEqual(['abnormal_movement']);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 120)).id);
    await evaluate((await detect(w.orgA.id, w.floorAreaCam, w.identity, 180)).id);
    expect((await orgEvents(w.orgA.id)).filter(abnormal)).toHaveLength(1);
    // A common transition is not abnormal.
    const other = await createIdentity(w.a);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, other, 0)).id);
    expect(types(await evaluate((await detect(w.orgA.id, w.floorCam, other, 60)).id))).toEqual([]);
  });

  it('should not emit above the organization threshold or while the areas lack history (cold start)', async () => {
    const w = await movementWorld();
    const move = async (identity: string, start: number): Promise<string[]> => {
      await evaluate((await detect(w.orgA.id, w.lobbyCam, identity, start)).id);
      return types(await evaluate((await detect(w.orgA.id, w.floorAreaCam, identity, start + 60)).id));
    };
    // No transitions at all: cold start.
    expect(await move(w.identity, 0)).toEqual([]);
    // Busy areas but the pair was seen twice (> abnormal_movement_max_count 1).
    await seedTransitions(w, [
      ['2026-01-04', w.lobby.id, w.zone.id, 25],
      ['2026-01-04', w.zone.id, w.floor.id, 25],
      ['2026-01-03', w.lobby.id, w.floor.id, 2],
    ]);
    expect(await move(await createIdentity(w.a), 1000)).toEqual([]);
    // Raised org threshold: 2 is rare enough.
    await runSql(`UPDATE itap.organization_settings SET abnormal_movement_max_count = 2 WHERE organization_id = '${w.orgA.id}'`);
    expect(await move(await createIdentity(w.a), 2000)).toEqual(['abnormal_movement']);
    // Areas below abnormal_movement_min_total (27 transitions each) count as cold.
    await runSql(`UPDATE itap.organization_settings SET abnormal_movement_min_total = 28 WHERE organization_id = '${w.orgA.id}'`);
    expect(await move(await createIdentity(w.a), 3000)).toEqual([]);
    // The first location of a session (no previous area) is never a transition.
    expect(types(await evaluate((await detect(w.orgA.id, w.floorAreaCam, await createIdentity(w.a), 4000)).id))).toEqual(['detection_unknown']);
  });
});
