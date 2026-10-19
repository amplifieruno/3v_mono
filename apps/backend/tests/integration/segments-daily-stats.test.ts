import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { dailyStats, refreshDailyStats } from './support/segmentCrons.js';
import { addMembers, asActor, createProfile, dynamicSegment, evaluate, manualSegment, segmentWorld, syncMembers } from './support/segments.js';
import { runSql } from './support/sql.js';

/**
 * segment_daily_stats (slice 6, task 3): itap.refresh_segment_daily_stats(org, at) upserts one row per segment for
 * the organization-local day of `at` (and of `at - 1 h`, so the first run of a day finishes the previous one).
 * member_count = open rows at `at` (end of day for a finished day); added / removed = rows opened / closed that day,
 * except a close and an open of the same subject at the same instant (a manual pin of a rule member), which is no
 * churn.
 */

const DAY = '2026-03-10';
const t = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;

describe('segment_daily_stats', () => {
  it('should count members at the time, additions and removals, without the pin pairs', async () => {
    const w = await segmentWorld();
    const dept = `Stats-${Date.now()}`;
    const [p1, p2, p3] = await Promise.all([1, 2, 3].map(() => createProfile(w.a, { department: dept })));
    const segment = await dynamicSegment(w.a, 'profiles', { field: 'department', operator: 'eq', value: dept });
    const actor = asActor(w.orgA.id);
    await syncMembers(actor, segment.id, [p1, p2], t('08:00'));
    await syncMembers(actor, segment.id, [p2, p3], t('09:00'));
    // A pin at 10:00 (what add_segment_members / the merge pin do): p2's rule row closes, a manual row opens.
    await runSql(
      `UPDATE itap.segment_members SET removed_at = '${t('10:00')}' WHERE segment_id = '${segment.id}' AND profile_id = '${p2}' AND removed_at IS NULL;
       INSERT INTO itap.segment_members (organization_id, segment_id, target, profile_id, source, added_at)
       VALUES ('${w.orgA.id}', '${segment.id}', 'profiles', '${p2}', 'manual', '${t('10:00')}')`,
    );
    const noon = await refreshDailyStats(w.orgA.id, t('12:00'));
    expect(noon).toEqual([{ day: DAY, member_count: 2, added: 3, removed: 1 }]);

    // Idempotent: the same time again changes nothing, still one row per day.
    expect(await refreshDailyStats(w.orgA.id, t('12:00'))).toEqual(noon);
    expect(await dailyStats(segment.id)).toEqual(noon);

    // p3 leaves at 23:30; the 00:30 run finishes DAY (members at its end) and starts the next day.
    await syncMembers(actor, segment.id, [], t('23:30'));
    await refreshDailyStats(w.orgA.id, '2026-03-11T00:30:00.000Z');
    expect(await dailyStats(segment.id)).toEqual([
      { day: DAY, member_count: 1, added: 3, removed: 2 },
      { day: '2026-03-11', member_count: 1, added: 0, removed: 0 },
    ]);
  });

  it('should not count a real manual pin of a rule member as churn, and cover manual segments', async () => {
    const w = await segmentWorld();
    const dept = `Pin-${Date.now()}`;
    const [p1, p2] = await Promise.all([1, 2].map(() => createProfile(w.a, { department: dept })));
    const segment = await dynamicSegment(w.a, 'profiles', { field: 'department', operator: 'eq', value: dept });
    const manual = await manualSegment(w.a, 'profiles');
    await evaluate(w.a, segment.id);
    await addMembers(w.a, segment.id, [p1]);
    await addMembers(w.a, manual.id, [p1, p2]);
    const now = new Date().toISOString();
    await refreshDailyStats(w.orgA.id, now);
    const today = now.slice(0, 10);
    expect((await dailyStats(segment.id)).find((r) => r.day === today)).toEqual({ day: today, member_count: 2, added: 2, removed: 0 });
    expect((await dailyStats(manual.id)).find((r) => r.day === today)).toEqual({ day: today, member_count: 2, added: 2, removed: 0 });
  });

  it('should be admin-only', async () => {
    const w = await segmentWorld();
    const err = await w.a
      .request(`mutation { refresh_segment_daily_stats(args: {p_organization: "${w.orgA.id}", p_at: "${t('12:00')}"}) { day } }`)
      .then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/not found in type/);
    // Sanity: the admin can call it for an organization without segments.
    const data = await asAdmin().request<{ refresh_segment_daily_stats: unknown[] }>(
      `mutation($o: uuid!) { refresh_segment_daily_stats(args: {p_organization: $o, p_at: "${t('12:00')}"}) { day } }`,
      { o: w.orgB.id },
    );
    expect(data.refresh_segment_daily_stats).toEqual([]);
  });
});
