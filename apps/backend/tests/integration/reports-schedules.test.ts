import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { asAdmin, asOrgAdmin, testEnv } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { notificationWorld, recipientGroup } from './support/notifications.js';
import { insertOne, updateByPk } from './support/operations.js';
import { REPORT_FIELDS, reportFiles, runScheduleCron, settled, type Report } from './support/reports.js';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { waitFor } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';
import type { HasuraClient } from '../../src/hasura/client.js';

type Schedule = { id: string; next_run_at: string | null; last_run_at: string | null };

async function schedule(id: string): Promise<Schedule> {
  const data = await asAdmin().request<{ report_schedules_by_pk: Schedule }>(
    `query($id: uuid!) { report_schedules_by_pk(id: $id) { id next_run_at last_run_at } }`,
    { id },
  );
  return data.report_schedules_by_pk;
}

async function scheduleReports(scheduleId: string): Promise<Report[]> {
  const data = await asAdmin().request<{ reports: Report[] }>(
    `query($s: uuid!) { reports(where: {schedule_id: {_eq: $s}}, order_by: {start_date: asc}) { ${REPORT_FIELDS} } }`,
    { s: scheduleId },
  );
  return data.reports;
}

type ReportDelivery = { recipient_user_id: string | null; recipient_address: string | null; channel: string; status: string; event_id: string | null; content: Record<string, unknown> };

async function reportDeliveries(reportId: string): Promise<ReportDelivery[]> {
  const data = await asAdmin().request<{ notification_deliveries: ReportDelivery[] }>(
    `query($r: uuid!) { notification_deliveries(where: {report_id: {_eq: $r}}, order_by: [{recipient_address: asc}, {recipient_user_id: asc}]) {
      recipient_user_id recipient_address channel status event_id content } }`,
    { r: reportId },
  );
  return data.notification_deliveries;
}

async function template(a: HasuraClient, parameters: Record<string, unknown>, reportType = 'occupancy'): Promise<string> {
  return (await insertOne(a, 'report_templates', { name: `${reportType} ${JSON.stringify(parameters)}`, report_type: reportType, format: 'csv', parameters })).id;
}

describe('report schedules', () => {
  beforeAll(requireBackend);

  it('should validate cron, timezone, channel and recipients', async () => {
    const w = await notificationWorld();
    const t = await template(w.a, { period: 'previous_day' });
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const base = { template_id: t, name: 'S', cron: '0 6 * * *', timezone: 'UTC', recipient_group_id: group, channel: 'in_app' };
    for (const bad of [
      { cron: '61 * * * *' }, { cron: '* * * *' }, { cron: '0 6 * * MON' }, { cron: '5-1 * * * *' }, { cron: '*/0 * * * *' },
      { timezone: 'Mars/Olympus' }, { channel: 'sms' }, { recipient_group_id: null },
      { template_id: await template(w.a, {}, 'incident') },
    ]) {
      await expectError(insertOne(w.a, 'report_schedules', { ...base, ...bad }));
    }
    await expectError(template(w.a, { period: 'fortnight' }));
    const ok = await insertOne(w.a, 'report_schedules', { ...base, cron: '*/15 8-18 1,15 1-12 1-5' });
    await expectDenied(updateByPk(w.a, 'report_schedules', ok.id, { next_run_at: null }), 'next_run_at');
    await expectDenied(updateByPk(w.a, 'report_schedules', ok.id, { last_run_at: null }), 'last_run_at');
    // Webhook schedules need no group (delivery = report_generated webhooks).
    await insertOne(w.a, 'report_schedules', { ...base, channel: 'webhook', recipient_group_id: null });
    // A valid expression that never matches (30 February) is never due.
    const never = await insertOne(w.a, 'report_schedules', { ...base, cron: '0 0 30 2 *' });
    await runScheduleCron([w.orgA.id], '2026-01-05T00:00:00Z');
    expect((await schedule(never.id)).next_run_at).toBe('infinity');
    expect((await schedule(ok.id)).next_run_at).toBe('2026-01-05T08:00:00+00:00');
  });

  it('should compute previous complete periods in the schedule timezone', async () => {
    const rows = await runSqlRows(`SELECT p.kind, r.start_date, r.end_date
      FROM (VALUES ('previous_day'), ('previous_week'), ('previous_month')) p (kind),
      LATERAL itap.report_period(p.kind, 'Europe/Berlin', '2026-01-04T23:30:00Z') r ORDER BY 1`);
    // 2026-01-04 23:30Z is Monday 2026-01-05 00:30 in Berlin.
    expect(rows).toEqual([
      { kind: 'previous_day', start_date: '2026-01-04', end_date: '2026-01-04' },
      { kind: 'previous_month', start_date: '2025-12-01', end_date: '2025-12-31' },
      { kind: 'previous_week', start_date: '2025-12-29', end_date: '2026-01-04' },
    ]);
  });

  it('should run due schedules once per period and deliver the reports to the recipient group', async () => {
    const w = await notificationWorld();
    const daily = await template(w.a, { period: 'previous_day' });
    const weekly = await template(w.a, { period: 'previous_week' });
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'in_app' },
      { user_id: w.carol, channel: 'in_app' },
      { user_id: w.user.id, channel: 'email' },
      { external_address: 'ops@example.com', channel: 'email' },
    ]);
    const inApp = await insertOne(w.a, 'report_schedules', {
      template_id: daily, name: 'Daily', cron: '0 6 * * *', timezone: 'Europe/Berlin', recipient_group_id: group, channel: 'in_app',
    });
    const email = await insertOne(w.a, 'report_schedules', {
      template_id: weekly, name: 'Weekly', cron: '0 6 * * 1', timezone: 'UTC', recipient_group_id: group, channel: 'email',
    });
    const paused = await insertOne(w.a, 'report_schedules', {
      template_id: daily, name: 'Paused', cron: '0 6 * * *', timezone: 'UTC', recipient_group_id: group, channel: 'email', is_active: false,
    });

    // First run: next runs are set, nothing is due yet.
    await runScheduleCron([w.orgA.id], '2026-01-04T23:00:00Z');
    expect(await schedule(inApp.id)).toMatchObject({ next_run_at: '2026-01-05T05:00:00+00:00', last_run_at: null });
    expect(await schedule(email.id)).toMatchObject({ next_run_at: '2026-01-05T06:00:00+00:00', last_run_at: null });
    expect((await schedule(paused.id)).next_run_at).toBeNull();
    expect(await scheduleReports(inApp.id)).toEqual([]);

    // Both due at 07:00Z; a retried or repeated run creates nothing more.
    await runScheduleCron([w.orgA.id], '2026-01-05T07:00:00Z', 'run-1');
    await runScheduleCron([w.orgA.id], '2026-01-05T07:00:00Z', 'run-1');
    await runScheduleCron([w.orgA.id], '2026-01-05T07:10:00Z');
    expect(await schedule(inApp.id)).toEqual({
      id: inApp.id, last_run_at: '2026-01-05T05:00:00+00:00', next_run_at: '2026-01-06T05:00:00+00:00',
    });
    expect(await schedule(email.id)).toMatchObject({ last_run_at: '2026-01-05T06:00:00+00:00', next_run_at: '2026-01-12T06:00:00+00:00' });
    await runSql(`SELECT itap.run_report_schedule('${inApp.id}', '2026-01-05T05:00:00Z', '2026-01-06T05:00:00Z')`);
    const [dailyReport, ...moreDaily] = await scheduleReports(inApp.id);
    const [weeklyReport, ...moreWeekly] = await scheduleReports(email.id);
    expect([moreDaily, moreWeekly]).toEqual([[], []]);
    expect(dailyReport).toMatchObject({ report_type: 'occupancy', format: 'csv', template_id: daily, start_date: '2026-01-04', end_date: '2026-01-04' });
    expect(weeklyReport).toMatchObject({ start_date: '2025-12-29', end_date: '2026-01-04' });

    // Completed reports go to the group members on the schedule's channel.
    expect((await settled(dailyReport.id)).status).toBe('completed');
    expect((await settled(weeklyReport.id)).status).toBe('completed');
    const inAppRows = await reportDeliveries(dailyReport.id);
    expect(inAppRows.map((d) => [d.channel, d.recipient_user_id, d.status]).sort()).toEqual(
      [['in_app', w.bob, 'delivered'], ['in_app', w.carol, 'delivered']].sort(),
    );
    expect(inAppRows[0].content).toMatchObject({ report_code: dailyReport.code });
    const inbox = await asAdmin().request<{ user_notifications: { user_id: string; title: string }[] }>(
      `query($d: [uuid!]!) { user_notifications(where: {delivery_id: {_in: $d}}) { user_id title } }`,
      { d: (await runSqlRows(`SELECT id FROM itap.notification_deliveries WHERE report_id = '${dailyReport.id}'`)).map((r) => r.id) },
    );
    expect(inbox.user_notifications.map((n) => n.user_id).sort()).toEqual([w.bob, w.carol].sort());
    const emailRows = await waitFor(
      () => reportDeliveries(weeklyReport.id),
      (rows) => rows.length === 2 && rows.every((d) => d.status === 'sent' || d.status === 'delivered'),
    );
    expect(emailRows.map((d) => d.recipient_address ?? d.recipient_user_id).sort()).toEqual(['ops@example.com', w.user.id].sort());
    expect(emailRows.every((d) => d.event_id !== null)).toBe(true);

    // Changing the cron resets next_run_at (recomputed by the next run).
    await updateByPk(w.a, 'report_schedules', inApp.id, { cron: '30 6 * * *' });
    expect((await schedule(inApp.id)).next_run_at).toBeNull();
  });

  it('should isolate a failing schedule: record the error, move it on and run the others', async () => {
    const w = await notificationWorld();
    const groupA = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    const groupB = await recipientGroup(b, [{ user_id: w.other.id, channel: 'in_app' }]);
    const base = { name: 'S', cron: '0 6 * * *', timezone: 'UTC', channel: 'in_app' };
    const poisoned = await insertOne(w.a, 'report_schedules', { ...base, template_id: await template(w.a, {}), recipient_group_id: groupA });
    const healthy = await insertOne(b, 'report_schedules', { ...base, template_id: await template(b, {}), recipient_group_id: groupB });
    const tag = poisoned.id.replace(/-/g, '');
    await runSql(`CREATE FUNCTION itap.test_poison_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'test_schedule_poisoned'; END $$;
      CREATE TRIGGER test_poison_${tag} BEFORE INSERT ON itap.reports FOR EACH ROW
        WHEN (NEW.schedule_id = '${poisoned.id}') EXECUTE FUNCTION itap.test_poison_${tag}()`);
    try {
      await runScheduleCron([w.orgA.id, w.orgB.id], '2026-01-04T23:00:00Z');
      const result = await runScheduleCron([w.orgA.id, w.orgB.id], '2026-01-05T07:00:00Z');
      expect(result).toMatchObject({ schedules_failed: 1, reports_created: 1 });
      expect(await scheduleReports(healthy.id)).toHaveLength(1);
      const failed = await asAdmin().request<{ report_schedules_by_pk: Record<string, unknown> }>(
        `query($id: uuid!) { report_schedules_by_pk(id: $id) { next_run_at last_run_at last_error last_failed_at } }`,
        { id: poisoned.id },
      );
      expect(failed.report_schedules_by_pk).toMatchObject({ next_run_at: '2026-01-06T06:00:00+00:00', last_run_at: null });
      expect(failed.report_schedules_by_pk.last_error).toContain('test_schedule_poisoned');
      expect(failed.report_schedules_by_pk.last_failed_at).not.toBeNull();
    } finally {
      await runSql(`DROP TRIGGER test_poison_${tag} ON itap.reports; DROP FUNCTION itap.test_poison_${tag}()`);
    }
    // The next successful run clears the error.
    await runScheduleCron([w.orgA.id], '2026-01-06T07:00:00Z');
    const ok = await asAdmin().request<{ report_schedules_by_pk: Record<string, unknown> }>(
      `query($id: uuid!) { report_schedules_by_pk(id: $id) { last_error last_failed_at last_run_at } }`,
      { id: poisoned.id },
    );
    expect(ok.report_schedules_by_pk).toEqual({ last_error: null, last_failed_at: null, last_run_at: '2026-01-06T06:00:00+00:00' });
    await expectDenied(updateByPk(w.a, 'report_schedules', poisoned.id, { last_error: null }), 'last_error');
  });

  it('should reclaim a report whose lease expired and fail one out of attempts', async () => {
    const w = await notificationWorld();
    const [stuck, exhausted] = await runSqlRows(`INSERT INTO itap.reports
        (organization_id, report_type, title, format, start_date, end_date, status, attempts, lease_expires_at)
      VALUES ('${w.orgA.id}', 'flow', 'Stuck', 'json', '2026-01-05', '2026-01-05', 'generating', 1, now() - interval '1 minute'),
             ('${w.orgA.id}', 'flow', 'Exhausted', 'json', '2026-01-05', '2026-01-05', 'generating', 3, now() - interval '1 minute')
      RETURNING id`);
    // A crashed attempt left its uploaded file behind; the next claim sweeps it.
    const leftover = await createStorageClient(testEnv()).upload({
      bucketId: w.orgA.id, name: 'left.json', mimeType: 'application/json', data: Buffer.from('{}'),
      metadata: { kind: 'report', report_id: stuck.id },
    });
    const result = await runScheduleCron([w.orgA.id], new Date().toISOString());
    expect(result).toMatchObject({ reports_due: 2 });
    const done = await settled(stuck.id ?? '');
    expect(done).toMatchObject({ status: 'completed', attempts: 2 });
    expect(await reportFiles(w.orgA.id, stuck.id ?? '')).toEqual([done.file_id]);
    expect(done.file_id).not.toBe(leftover.id);
    expect(await settled(exhausted.id ?? '')).toMatchObject({ status: 'failed', error: 'max_attempts', attempts: 3 });
    // A live lease is not reclaimed.
    const [busy] = await runSqlRows(`INSERT INTO itap.reports
        (organization_id, report_type, title, format, start_date, end_date, status, attempts, lease_expires_at)
      VALUES ('${w.orgA.id}', 'flow', 'Busy', 'json', '2026-01-05', '2026-01-05', 'generating', 1, now() + interval '5 minutes')
      RETURNING id`);
    expect(await runScheduleCron([w.orgA.id], new Date().toISOString())).toMatchObject({ reports_due: 0 });
    expect((await runSqlRows(`SELECT status FROM itap.reports WHERE id = '${busy.id}'`))[0].status).toBe('generating');
  });
});
