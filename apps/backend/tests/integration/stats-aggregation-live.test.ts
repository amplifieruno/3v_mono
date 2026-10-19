import { describe, expect, it } from 'vitest';
import { updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';
import { closeStale } from './support/stageB.js';
import { HOUR, aggregate, aggregateRange, clearStats, dailyStats, hourlyStats, setTrackingTimeout, transitions } from './support/analytics.js';
import { at, createTrackingWorld, detect } from './support/tracking.js';

const BASE = Date.parse(at(0)) / 1000;

describe('stats aggregation (live cron behaviour)', () => {
  it('should pick up an exit back-dated into an already aggregated hour on the next run', async () => {
    const w = await createTrackingWorld();
    // Default timeout 300 s. Seen in the Lobby 08:00 .. 08:58:20; the 09:05 run aggregates 08:00 while still active.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 250);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 500);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 3500);
    await aggregate(w.orgA.id, HOUR + 300);
    const lobby = async () => (await hourlyStats(w.orgA.id)).filter((r) => r.area === 'Lobby');
    expect(await lobby()).toEqual([expect.objectContaining({ hour: String(BASE), entries: '2', exits: '1' })]);
    // The stale-session cron closes the session after that run, ending it at 08:58:20 (last detection).
    await closeStale(w.orgA.id, HOUR + 400);
    await aggregate(w.orgA.id, 2 * HOUR + 300);
    expect(await lobby()).toEqual([expect.objectContaining({ hour: String(BASE), entries: '2', exits: '2' })]);
    // Settled data: the range gives the same rows.
    const hourly = [await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)];
    await clearStats(w.orgA.id);
    await aggregateRange(w.orgA.id, 0, 2 * HOUR);
    expect([await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)]).toEqual(hourly);
  });

  it('should aggregate the 23-hour local day of a daylight saving change', async () => {
    const w = await createTrackingWorld();
    await setTrackingTimeout(w.orgA.id, 7200);
    await updateByPk(w.a, 'facilities', w.facility.id, { timezone: 'Europe/Berlin' });
    // 2026-03-29 (clocks go forward in Berlin): local day = 2026-03-28 23:00 UTC .. 2026-03-29 22:00 UTC.
    const days = await runSqlRows(`SELECT day, extract(epoch FROM window_end - day_start)::int AS seconds
      FROM itap.stats_days('${w.orgA.id}', '2026-03-29T05:00:00Z', '2026-03-29T06:00:00Z')`);
    expect(days).toEqual([{ day: '2026-03-29', seconds: String(23 * HOUR) }]);
    // Present 21:30 .. 22:30 UTC = 23:30 (Mar 29) .. 00:30 (Mar 30) CEST: half an hour on each local day.
    const s = (iso: string) => Date.parse(iso) / 1000 - BASE;
    await detect(w.orgA.id, w.lobbyCam, w.identity, s('2026-03-29T21:30:00Z'));
    await detect(w.orgA.id, w.lobbyCam, w.identity, s('2026-03-29T22:30:00Z'));
    await closeStale(w.orgA.id, s('2026-03-30T02:00:00Z'));
    await aggregateRange(w.orgA.id, s('2026-03-29T21:00:00Z'), s('2026-03-29T23:00:00Z'));
    expect((await dailyStats(w.orgA.id)).map((r) => [r.day, r.dwell_seconds, r.visits, r.peak_hour])).toEqual([
      ['2026-03-29', '1800', '1', '23'],
      ['2026-03-30', '1800', '0', '0'],
    ]);
  });
});
