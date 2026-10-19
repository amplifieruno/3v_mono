import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { createIncident, insertOne } from './support/operations.js';
import { createReport, download, metric, metrics, settled } from './support/reports.js';
import { runSql } from './support/sql.js';
import { createTrackingWorld } from './support/tracking.js';

/**
 * Report type incident_summary (slice 7, task 5): the incidents opened in the period (a schedulable "daily
 * incidents" report; `incident` stays the single-incident report).
 */
const DAY = '2026-01-05';

beforeAll(requireBackend);

describe('incident_summary report', () => {
  it('should list the incidents opened in the period with counts by severity and status', async () => {
    const w = await createTrackingWorld();
    const opened = async (severity: string, at: string, extra: Record<string, unknown> = {}) => {
      const incident = await createIncident(w.a, { title: `Incident ${severity}`, severity, facility_id: w.facility.id, ...extra });
      await runSql(`UPDATE itap.incidents SET created_at = '${at}' WHERE id = '${incident.id}'`);
      return incident;
    };
    await opened('critical', `${DAY}T03:00:00Z`);
    await opened('high', `${DAY}T12:00:00Z`);
    const done = await opened('high', `${DAY}T20:00:00Z`);
    await runSql(`UPDATE itap.incidents SET status = 'resolved', disposition = 'false_positive', resolved_at = '${DAY}T21:30:00Z',
      acknowledged_at = '${DAY}T20:10:00Z', acknowledged_by = '${w.user.id}', resolved_by = '${w.user.id}' WHERE id = '${done.id}'`);
    await opened('low', '2026-01-06T09:00:00Z');

    const created = await createReport(w.a, {
      report_type: 'incident_summary', format: 'csv', start_date: DAY, end_date: DAY, parameters: { timezone: 'UTC' },
    });
    const r = await settled(created.id);
    expect(r, r.error ?? '').toMatchObject({ status: 'completed' });
    const m = await metrics(r.id);
    expect([metric(m, 'incidents'), metric(m, 'open'), metric(m, 'resolved')]).toEqual([3, 2, 1]);
    expect(m.find((x) => x.metric_name === 'by_severity' && x.dimension.severity === 'high')?.value).toBe(2);
    expect(metric(m, 'avg_resolution_minutes')).toBe(90);
    const csv = (await download(r.file_id ?? '')).toString('utf8').split('\r\n');
    expect(csv[0]).toBe('Incident,Title,Severity,Status,Facility,Opened,Resolved,Disposition');
    expect(csv.filter((line) => line.startsWith('INCIDENT-'))).toHaveLength(3);
  });

  it('should be schedulable, unlike the single-incident report', async () => {
    const w = await createTrackingWorld();
    const group = await insertOne(w.a, 'recipient_groups', { name: 'Security' });
    const template = await insertOne(w.a, 'report_templates', {
      name: 'Daily incidents', report_type: 'incident_summary', format: 'pdf', parameters: { period: 'previous_day' },
    });
    const schedule = await insertOne(w.a, 'report_schedules', {
      name: 'Daily incidents', template_id: template.id, cron: '0 7 * * *', timezone: 'UTC', channel: 'in_app',
      recipient_group_id: group.id,
    });
    expect(schedule.id).toBeTruthy();
  });
});
