import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { insertOne, updateByPk } from './support/operations.js';
import { fromNow, isPending, requestRow, runPending } from './support/segmentCrons.js';
import {
  addMembers,
  asActor,
  createProfile,
  dynamicSegment,
  exactRows,
  manualSegment,
  openRows,
  segmentWorld,
  syncMembers,
} from './support/segments.js';
import { runSqlRows } from './support/sql.js';
import { detect } from './support/tracking.js';

/**
 * Debounced evaluation on input changes (slice 6, task 3): input writes request an evaluation of their organization
 * (segment_evaluation_requests, written at commit); the 1-minute cron evaluate_segments_pending evaluates the
 * organizations whose first unprocessed request is at least 30 s old. Scheduled times run 31 s ahead of the clock so
 * the live dev cron (real time) does not pick the test's requests up first.
 */

const ops = (department: string) => ({ field: 'department', operator: 'eq', value: department });

async function lastEvaluatedAt(segment: string): Promise<string | null> {
  const [row] = await runSqlRows(`SELECT last_evaluated_at FROM itap.segments WHERE id = '${segment}'`);
  return row.last_evaluated_at === 'NULL' ? null : row.last_evaluated_at;
}

describe('evaluate_segments_pending', () => {
  it('should evaluate an organization once, 30 s after several input writes', async () => {
    const w = await segmentWorld();
    const dept = `Debounce-${Date.now()}`;
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    const ids = [await createProfile(w.a, { department: dept }), await createProfile(w.a, { department: dept })];
    const late = await createProfile(w.a, { department: 'Not yet' });
    await updateByPk(w.a, 'profiles', late, { department: dept });
    ids.push(late);

    const [row] = await runSqlRows(`SELECT count(*) AS n FROM itap.segment_evaluation_requests WHERE organization_id = '${w.orgA.id}'`);
    expect(row.n).toBe('1');
    expect(await isPending(w.orgA.id)).toBe(true);
    const first = await requestRow(w.orgA.id);

    // Not yet 30 s old: nothing happens.
    expect(await runPending([w.orgA.id], new Date().toISOString())).toMatchObject({ organizations: 0 });
    expect(await lastEvaluatedAt(segment.id)).toBeNull();

    const at = fromNow(31);
    expect(await runPending([w.orgA.id], at)).toMatchObject({ organizations: 1, segments: 1, failed: 0 });
    expect(Date.parse(String(await lastEvaluatedAt(segment.id)))).toBe(Date.parse(at));
    expect(await openRows(segment.id)).toEqual([...ids].sort().map((id) => [id, 'rule']));
    // The evaluator's own writes (rule rows, member_count, last_evaluated_at) request nothing.
    expect(await isPending(w.orgA.id)).toBe(false);
    expect((await requestRow(w.orgA.id))?.first_requested_at).toBe(first?.first_requested_at);

    // Nothing pending: the next run evaluates nothing.
    expect(await runPending([w.orgA.id], fromNow(40))).toMatchObject({ organizations: 0 });
    expect(Date.parse(String(await lastEvaluatedAt(segment.id)))).toBe(Date.parse(at));
    expect(await exactRows(segment.id)).toHaveLength(3);
  });

  it('should request on manual membership, segment definition, identity status and schedule changes only', async () => {
    const w = await segmentWorld();
    const dept = `Inputs-${Date.now()}`;
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    const manual = await manualSegment(w.a, 'profiles');
    const person = await createProfile(w.a, { department: dept });
    // Each run is later than the previous one (and than the sync below), so no evaluation is stale.
    let ahead = 40;
    const settle = async () => {
      await runPending([w.orgA.id], fromNow((ahead += 10)));
      expect(await isPending(w.orgA.id)).toBe(false);
    };
    await settle();

    // Rule rows (sync) and detections (identity counters) are not inputs.
    await syncMembers(asActor(w.orgA.id), segment.id, [person], fromNow((ahead += 10)));
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    expect(await isPending(w.orgA.id)).toBe(false);

    await addMembers(w.a, manual.id, [person]);
    expect(await isPending(w.orgA.id)).toBe(true);
    await settle();

    await updateByPk(w.a, 'segments', segment.id, { status: 'inactive' });
    expect(await isPending(w.orgA.id)).toBe(true);
    await settle();
    // ... and the pending run applied it: an inactive segment keeps no rule rows.
    expect(await openRows(segment.id)).toEqual([]);

    await updateByPk(w.a, 'identities', w.identity, { status: 'archived' });
    expect(await isPending(w.orgA.id)).toBe(true);
    await settle();

    await insertOne(w.a, 'work_schedules', { name: `Shift ${Date.now()}`, timezone: 'UTC', windows: [] });
    expect(await isPending(w.orgA.id)).toBe(true);
    await settle();

    // Watch lists: the kind decides is_blacklisted (request); a rename does not. Entry expiry is hourly.
    const list = await insertOne(w.a, 'watch_lists', { name: `List ${Date.now()}`, kind: 'watch', severity: 'low' });
    await updateByPk(w.a, 'watch_lists', list.id, { name: `Renamed ${Date.now()}` });
    expect(await isPending(w.orgA.id)).toBe(false);
    await updateByPk(w.a, 'watch_lists', list.id, { kind: 'blacklist' });
    expect(await isPending(w.orgA.id)).toBe(true);
    await settle();

    // A write in another organization requests only that organization.
    await createProfile(w.b, { department: dept });
    expect(await isPending(w.orgA.id)).toBe(false);
    expect(await isPending(w.orgB.id)).toBe(true);
  });

  it('should keep the organization pending when a sync was stale and apply the change on the next run', async () => {
    const w = await segmentWorld();
    const dept = `Stale-${Date.now()}`;
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    const first = await createProfile(w.a, { department: dept });
    // A manual evaluation stamped after the run's evaluation time (e.g. evaluate_segment while the run was late).
    await syncMembers(asActor(w.orgA.id), segment.id, [first], fromNow(120));
    const second = await createProfile(w.a, { department: dept });

    expect(await runPending([w.orgA.id], fromNow(31))).toMatchObject({ organizations: 1, pending: 1 });
    expect(await isPending(w.orgA.id)).toBe(true);
    expect(await openRows(segment.id)).toEqual([[first, 'rule']]);

    expect(await runPending([w.orgA.id], fromNow(130))).toMatchObject({ organizations: 1, pending: 0 });
    expect(await isPending(w.orgA.id)).toBe(false);
    expect(await openRows(segment.id)).toEqual([first, second].sort().map((id) => [id, 'rule']));
  });

  it('should keep a request pending when it was renewed after the run read it', async () => {
    const w = await segmentWorld();
    await createProfile(w.a);
    const before = await requestRow(w.orgA.id);
    // A write after the run listed the organization renews requested_at; finishing with the old value is a no-op.
    await createProfile(w.a);
    const data = await asAdmin().request<{ finish_segment_evaluation_request: unknown[] }>(
      `mutation($o: uuid!, $r: timestamptz!) {
         finish_segment_evaluation_request(args: {p_organization: $o, p_requested_at: $r}) { organization_id }
       }`,
      { o: w.orgA.id, r: before?.requested_at },
    );
    expect(data.finish_segment_evaluation_request).toEqual([]);
    expect(await isPending(w.orgA.id)).toBe(true);
    const after = await requestRow(w.orgA.id);
    expect(Date.parse(String(after?.requested_at))).toBeGreaterThan(Date.parse(String(before?.requested_at)));
    // The window start (debounce) is the first unprocessed request.
    expect(after?.first_requested_at).toBe(before?.first_requested_at);
  });

  it('should keep org_admin away from the request table and the cron functions', async () => {
    const w = await segmentWorld();
    const err = await w.a
      .request(`query { segment_evaluation_requests { organization_id } }`)
      .then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/not found in type/);
    const fn = await w.a
      .request(`query { due_segment_evaluations(args: {p_at: "2026-01-01T00:00:00Z"}) { organization_id } }`)
      .then(() => null, (e: Error) => e);
    expect(fn?.message).toMatch(/not found in type/);
  });
});
