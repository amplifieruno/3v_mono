import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { aggregateRange, statsWorld, type StatsWorld } from './support/analytics.js';
import { requireBackend } from './support/backend.js';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { activities, createIncident, deleteByPk, insertOne, updateByPk } from './support/operations.js';
import {
  callReportFn,
  createReport,
  download,
  metric,
  metrics,
  reportFiles,
  settled,
  storedFile,
} from './support/reports.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { createIdentity, detect } from './support/tracking.js';

const DAY = '2026-01-05';
const HOUR = 3600;

/** statsWorld (2026-01-05, UTC) aggregated, plus attendance, segment, device health and activity inputs. */
async function reportWorld(): Promise<StatsWorld & { segment: string }> {
  const w = await statsWorld();
  const schedule = await insertOne(w.a, 'work_schedules', {
    name: 'Office',
    timezone: 'UTC',
    windows: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00' }],
  });
  await runSql(`UPDATE itap.profiles SET work_schedule_id = '${schedule.id}' WHERE id = '${w.profile}'`);
  // Late: first seen 09:00; absent: never seen.
  const late = await createProfile(w.a, { work_schedule_id: schedule.id });
  await createProfile(w.a, { work_schedule_id: schedule.id });
  const p3 = await createIdentity(w.a);
  await runSql(`UPDATE itap.identities SET profile_id = '${late}' WHERE id = '${p3}'`);
  await detect(w.orgA.id, w.lobbyCam, p3, HOUR);
  await aggregateRange(w.orgA.id, -2 * HOUR, 24 * HOUR);
  await runSql(`SELECT itap.refresh_activity_stats('${w.orgA.id}', '${DAY}T23:00:00Z')`);

  const segment = await insertOne(w.a, 'segments', { name: 'VIP', kind: 'manual', target: 'identities' });
  await runSql(`INSERT INTO itap.segment_daily_stats (organization_id, segment_id, day, member_count, added, removed)
    VALUES ('${w.orgA.id}', '${segment.id}', '${DAY}', 5, 2, 1)`);
  await runSql(`INSERT INTO itap.device_health_metrics (organization_id, device_id, recorded_at, cpu_usage, network_latency_ms, frame_rate, error_count)
    VALUES ('${w.orgA.id}', '${w.lobbyCam.id}', '${DAY}T08:00:00Z', 40, 20, 25, 0),
           ('${w.orgA.id}', '${w.lobbyCam.id}', '${DAY}T09:00:00Z', 60, 40, 15, 3);
    INSERT INTO itap.device_events (organization_id, device_id, kind, message, occurred_at)
    VALUES ('${w.orgA.id}', '${w.lobbyCam.id}', 'offline', 'probe failed', '${DAY}T09:00:00Z')`);
  return { ...w, segment: segment.id };
}

describe('reports', () => {
  let w: Awaited<ReturnType<typeof reportWorld>>;
  beforeAll(async () => {
    await requireBackend();
    w = await reportWorld();
  });

  it('should keep generation columns read-only and reports undeletable for org_admin', async () => {
    const r = await createReport(w.a, { report_type: 'occupancy', format: 'csv', start_date: DAY, end_date: DAY });
    expect(r.status).toBe('queued');
    expect(r.code).toMatch(/^REPORT-\d{5}$/);
    await expectDenied(createReport(w.a, { report_type: 'flow', format: 'csv', start_date: DAY, end_date: DAY, status: 'completed' }), 'status');
    for (const column of ['status', 'file_id', 'summary', 'error', 'generated_at', 'format']) {
      await expectDenied(updateByPk(w.a, 'reports', r.id, { [column]: null }), column);
    }
    expect(await updateByPk(w.a, 'reports', r.id, { title: 'Renamed' })).toEqual({ id: r.id });
    await expectDenied(deleteByPk(w.a, 'reports', r.id), 'delete_reports_by_pk');
    // Period rules: dates required (except incident reports), ordered, at most 366 days.
    await expectError(createReport(w.a, { report_type: 'flow', format: 'csv' }));
    await expectError(createReport(w.a, { report_type: 'flow', format: 'csv', start_date: DAY, end_date: '2026-01-01' }));
    await expectError(createReport(w.a, { report_type: 'flow', format: 'csv', start_date: '2025-01-01', end_date: '2026-01-05' }));
    await expectError(createReport(w.a, { report_type: 'incident', format: 'pdf', start_date: DAY, end_date: DAY }));
    // Other organizations see nothing.
    const other = asOrgAdmin(w.other.id, w.orgB.id);
    const seen = await other.request<{ reports: unknown[] }>(`query($id: uuid!) { reports(where: {id: {_eq: $id}}) { id } }`, { id: r.id });
    expect(seen.reports).toEqual([]);
    await settled(r.id);
  });

  it('should compute every report type and render every format into the organization bucket', async () => {
    const cases = [
      { report_type: 'flow', format: 'csv' },
      { report_type: 'occupancy', format: 'xlsx', report_facilities: { data: [{ facility_id: w.facility.id }] } },
      { report_type: 'heatmap', format: 'json' },
      { report_type: 'behavior', format: 'pdf' },
      { report_type: 'attendance', format: 'csv' },
      { report_type: 'segment', format: 'json', report_segments: { data: [{ segment_id: w.segment }] } },
      { report_type: 'device_health', format: 'xlsx' },
    ];
    const today = new Date().toISOString().slice(0, 10);
    const created = await Promise.all([
      ...cases.map((c) => createReport(w.a, { ...c, start_date: DAY, end_date: DAY })),
      createReport(w.a, { report_type: 'compliance', format: 'pdf', start_date: today, end_date: today }),
    ]);
    const done = await Promise.all(created.map((r) => settled(r.id)));
    for (const r of done) {
      expect(r, `${r.report_type}: ${r.error}`).toMatchObject({ status: 'completed', error: null, attempts: 1 });
      expect(r.generated_at).not.toBeNull();
      expect(r.summary?.file_name).toBe(`${r.code}.${r.format}`);
      const file = await storedFile(r.file_id ?? '');
      expect(file).toMatchObject({ bucketId: w.orgA.id, metadata: { kind: 'report', report_id: r.id } });
      expect((await metrics(r.id)).length, r.report_type).toBeGreaterThan(0);
    }
    const byType = Object.fromEntries(done.map((r) => [r.report_type, r]));

    // flow: P1 Lobby -> Zone A -> Lobby, P2 Lobby -> Zone A.
    expect(metric(await metrics(byType.flow.id), 'total_transitions')).toBe(3);
    const csv = (await download(byType.flow.file_id ?? '')).toString('utf8').split('\r\n');
    expect(csv[0]).toBe('Facility,From area,To area,Transitions');
    expect(csv).toContain(`${w.facility.name},Lobby,Zone A,2`);
    // occupancy (xlsx): a zip; facility-day rows from facility_daily_stats.
    expect((await download(byType.occupancy.file_id ?? '')).subarray(0, 2).toString('latin1')).toBe('PK');
    expect(metric(await metrics(byType.occupancy.id), 'days')).toBe(1);
    // heatmap (json): rows per area and local hour.
    const heat = JSON.parse((await download(byType.heatmap.file_id ?? '')).toString('utf8')) as { rows: Record<string, unknown>[] };
    expect(heat.rows).toContainEqual(expect.objectContaining({ Area: 'Zone A', Hour: 8 }));
    // behavior (pdf).
    expect((await download(byType.behavior.file_id ?? '')).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(metric(await metrics(byType.behavior.id), 'identities')).toBeGreaterThanOrEqual(3);
    // attendance: present (07:50), late (09:00), absent.
    const att = await metrics(byType.attendance.id);
    expect([metric(att, 'present'), metric(att, 'late'), metric(att, 'absent'), metric(att, 'scheduled_days')]).toEqual([1, 1, 1, 3]);
    // segment.
    expect((await metrics(byType.segment.id)).find((m) => m.metric_name === 'members_end')).toMatchObject({ value: 5, dimension: { segment: 'VIP' } });
    // device health: 2 samples, 3 errors, 1 offline event.
    const dh = await metrics(byType.device_health.id);
    expect([metric(dh, 'offline_events'), metric(dh, 'errors')]).toEqual([1, 3]);
    // compliance: today's audit rows (this suite's inserts).
    expect(metric(await metrics(byType.compliance.id), 'audit_entries')).toBeGreaterThan(0);
  });

  it('should generate an incident report with the timeline and log it on the incident', async () => {
    const incident = await createIncident(w.a, { title: 'Door forced' });
    await updateByPk(w.a, 'incidents', incident.id, { assigned_to: w.user.id });
    await insertOne(w.a, 'incident_notes', { incident_id: incident.id, body: 'Guard dispatched' });
    const [r] = await callReportFn(w.a, 'generate_incident_report', { p_incident: incident.id, p_format: 'csv' });
    expect(r).toMatchObject({ report_type: 'incident', incident_id: incident.id, format: 'csv', status: 'queued' });
    const done = await settled(r.id);
    expect(done.status).toBe('completed');
    const csv = (await download(done.file_id ?? '')).toString('utf8');
    expect(csv.split('\r\n')[0]).toBe('Time,Kind,Actor,Details');
    expect(csv).toContain('Guard dispatched');
    // Actors and user ids in activity details render as names / emails, never raw ids.
    expect(csv).toContain(`to: ${w.user.email}`);
    expect(csv).not.toContain(w.user.id);
    expect(metric(await metrics(r.id), 'notes')).toBe(1);
    expect((await activities(w.a, incident.id)).map((x) => x.kind)).toContain('report_generated');
    // Another organization cannot report on it.
    await expectError(callReportFn(asOrgAdmin(w.other.id, w.orgB.id), 'generate_incident_report', { p_incident: incident.id }));
  });

  it('should emit report_generated through Stage C to webhook subscriptions', async () => {
    const sub = await insertOne(w.a, 'webhook_subscriptions', {
      url: 'http://backend:3001/hasura/events/webhook-sink',
      secret: 'whsec-test-0123456789abcdef',
      webhook_subscription_event_types: { data: [{ event_type: 'report_generated' }] },
    });
    const r = await createReport(w.a, { report_type: 'flow', format: 'json', start_date: DAY, end_date: DAY });
    await settled(r.id);
    const events = await w.a.request<{ events: { id: string; payload: Record<string, unknown> }[] }>(
      `query($o: uuid!) { events(where: {organization_id: {_eq: $o}, event_type: {_eq: report_generated}}) { id payload } }`,
      { o: w.orgA.id },
    );
    const event = events.events.find((e) => e.payload.report_id === r.id);
    expect(event?.payload).toMatchObject({ report_id: r.id, code: r.code, report_type: 'flow', format: 'json' });
    const hooks = await w.a.request<{ webhook_deliveries: { event_id: string; subscription_id: string }[] }>(
      `query($e: uuid!) { webhook_deliveries(where: {event_id: {_eq: $e}}) { event_id subscription_id } }`,
      { e: event?.id },
    );
    expect(hooks.webhook_deliveries).toEqual([{ event_id: event?.id, subscription_id: sub.id }]);
  });

  it('should fail a report that breaks after the upload without leaving a file, and retry it', async () => {
    // A test trigger rejects the completion of reports with this title: the file is uploaded by then.
    const tag = randomUUID().replace(/-/g, '');
    const title = `Breaks ${tag}`;
    await runSql(`CREATE FUNCTION itap.test_block_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'test_completion_blocked'; END $$;
      CREATE TRIGGER test_block_${tag} BEFORE UPDATE ON itap.reports FOR EACH ROW
        WHEN (NEW.title = '${title}' AND NEW.status = 'completed') EXECUTE FUNCTION itap.test_block_${tag}()`);
    let id = '';
    try {
      id = (await createReport(w.a, { report_type: 'occupancy', format: 'pdf', start_date: DAY, end_date: DAY, title })).id;
      const failed = await settled(id);
      expect(failed).toMatchObject({ status: 'failed', file_id: null, attempts: 1, generated_at: null });
      expect(failed.error).toContain('test_completion_blocked');
      expect(await reportFiles(w.orgA.id, id)).toEqual([]);
    } finally {
      await runSql(`DROP TRIGGER test_block_${tag} ON itap.reports; DROP FUNCTION itap.test_block_${tag}()`);
    }
    const [requeued] = await callReportFn(w.a, 'retry_report', { p_report: id });
    expect(requeued).toMatchObject({ status: 'queued', error: null, attempts: 1 });
    const done = await settled(id);
    expect(done).toMatchObject({ status: 'completed', attempts: 2, error: null });
    expect(await reportFiles(w.orgA.id, id)).toEqual([done.file_id]);
    // Only failed reports are retried; another organization gets not-found.
    await expectError(callReportFn(w.a, 'retry_report', { p_report: id }));
    await expectError(callReportFn(asOrgAdmin(w.other.id, w.orgB.id), 'retry_report', { p_report: id }));
    // Status never goes back from completed, even for trusted SQL.
    await expect(runSql(`UPDATE itap.reports SET status = 'queued' WHERE id = '${id}'`)).rejects.toThrow(/report_invalid_transition/);
  });

  it('should fence stale handlers with monotonic attempt numbers across retries', async () => {
    const [row] = await runSqlRows(`INSERT INTO itap.reports
        (organization_id, report_type, title, format, start_date, end_date, status, attempts, error)
      VALUES ('${w.orgA.id}', 'flow', 'Fenced', 'json', '${DAY}', '${DAY}', 'failed', 1, 'boom') RETURNING id`);
    const id = row.id ?? '';
    const [requeued] = await callReportFn(w.a, 'retry_report', { p_report: id });
    expect(requeued).toMatchObject({ status: 'queued', attempts: 1 });
    const done = await settled(id);
    expect(done).toMatchObject({ status: 'completed', attempts: 2 });
    // A handler of attempt 1 (before the retry) can neither fail nor complete the new generation.
    const [busy] = await runSqlRows(`INSERT INTO itap.reports
        (organization_id, report_type, title, format, start_date, end_date, status, attempts, attempts_at_retry, lease_expires_at)
      VALUES ('${w.orgA.id}', 'flow', 'Busy', 'json', '${DAY}', '${DAY}', 'generating', 2, 1, now() + interval '5 minutes')
      RETURNING id`);
    const stale = await runSqlRows(`SELECT
        (SELECT count(*) FROM itap.fail_report('${busy.id}', 1, 'stale')) AS failed,
        (SELECT count(*) FROM itap.complete_report('${busy.id}', 1, NULL, '{}')) AS completed`);
    expect(stale).toEqual([{ failed: '0', completed: '0' }]);
    expect((await runSqlRows(`SELECT status FROM itap.reports WHERE id = '${busy.id}'`))[0].status).toBe('generating');
    // Out of attempts counts only attempts since the last retry.
    await runSql(`UPDATE itap.reports SET lease_expires_at = now() - interval '1 second' WHERE id = '${busy.id}'`);
    expect(await callClaim(busy.id ?? '')).toEqual([{ attempts: '3', status: 'generating' }]);
  });

  it('should freeze report targets once generation started', async () => {
    const r = await createReport(w.a, {
      report_type: 'occupancy', format: 'csv', start_date: DAY, end_date: DAY,
      report_facilities: { data: [{ facility_id: w.facility.id }] },
    });
    await settled(r.id);
    await expectError(insertOne(w.a, 'report_facilities', { report_id: r.id, facility_id: w.facility.id }));
    await expectError(insertOne(w.a, 'report_segments', { report_id: r.id, segment_id: w.segment }));
    const rows = await runSqlRows(`SELECT id FROM itap.report_facilities WHERE report_id = '${r.id}'`);
    await expectError(deleteByPk(w.a, 'report_facilities', rows[0].id ?? ''));
  });

  it('should reject an invalid report timezone and audit opening a report file', async () => {
    await expectError(createReport(w.a, { report_type: 'flow', format: 'csv', start_date: DAY, end_date: DAY, parameters: { timezone: 'Mars/Olympus' } }));
    await expectError(insertOne(w.a, 'report_templates', { name: 'Bad tz', report_type: 'flow', parameters: { timezone: 'Nowhere' } }));
    const r = await settled((await createReport(w.a, { report_type: 'flow', format: 'csv', start_date: DAY, end_date: DAY })).id);
    await w.a.request(`mutation($f: uuid!) { open_file(file_id: $f) { url } }`, { f: r.file_id });
    const audit = await runSqlRows(`SELECT count(*) AS n FROM itap.audit_log
      WHERE organization_id = '${w.orgA.id}' AND action = 'view_sensitive' AND entity_id = '${r.file_id}'`);
    expect(audit[0].n).toBe('1');
  });

  it('should keep the template report type fixed', async () => {
    const t = await insertOne(w.a, 'report_templates', { name: 'Fixed type', report_type: 'flow' });
    await expectDenied(updateByPk(w.a, 'report_templates', t.id, { report_type: 'incident' }), 'report_type');
    await expect(runSql(`UPDATE itap.report_templates SET report_type = 'incident' WHERE id = '${t.id}'`)).rejects.toThrow(
      /report_template_type_immutable/,
    );
  });

  it('should not let org_admin forge templates marked as system', async () => {
    await expectDenied(insertOne(w.a, 'report_templates', { name: 'X', report_type: 'flow', is_system: true }), 'is_system');
    const sys = await insertOne(w.a, 'report_templates', { name: 'Sys', report_type: 'flow' });
    await runSql(`UPDATE itap.report_templates SET is_system = true WHERE id = '${sys.id}'`);
    expect(await updateByPk(w.a, 'report_templates', sys.id, { name: 'Changed' })).toBeNull();
    expect(await deleteByPk(w.a, 'report_templates', sys.id)).toBeNull();
    await expectDenied(
      insertOne(w.a, 'report_metrics', { report_id: sys.id, metric_name: 'x', metric_type: 'count', value: 1 }),
      'insert_report_metrics_one',
    );
  });
});


async function callClaim(id: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(`SELECT attempts, status FROM itap.claim_report('${id}')`);
}
