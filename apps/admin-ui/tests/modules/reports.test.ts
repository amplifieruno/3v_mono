import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { REPORT_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { newReportFlow, reportCreated } from '../../src/modules/analytics/report-flows';
import { REPORTS_BINDING, reportInsertObject } from '../../src/modules/analytics/report-ops';
import {
  MAX_REPORT_SPAN_DAYS,
  REPORT_TYPE_SHAPES,
  newReportInput,
  reportPeriodProblem,
  typesWith,
} from '../../src/modules/analytics/report-shape';
import { expectTranslated } from '../support/field-issues';

/**
 * Reports without the UI: the period check mirrors `reports_period` exactly (Review Focus 3), the
 * form of each report type sends only what that type is made from, Retry is offered on failed
 * reports only (Review Focus 4), and the refusals read as sentences.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const FACILITY = '22222222-2222-4222-8222-000000000001';
const SEGMENT = '44444444-4444-4444-8444-000000000001';
const INCIDENT = '55555555-5555-4555-8555-000000000001';
const REPORT = '66666666-6666-4666-8666-000000000001';

beforeAll(async () => {
  await app.ready;
});

describe('report period (reports_period)', () => {
  it('should accept up to 366 days between start and end, both days included', () => {
    expect(MAX_REPORT_SPAN_DAYS).toBe(366);
    expect(reportPeriodProblem('2026-10-01', '2026-10-01')).toBeNull();
    expect(reportPeriodProblem('2025-01-01', '2026-01-02')).toBeNull();
    // Across a leap day: 2024-02-29 is counted.
    expect(reportPeriodProblem('2024-01-01', '2025-01-01')).toBeNull();
  });

  it('should refuse more than 366 days, saying how many', async () => {
    const problem = reportPeriodProblem('2025-01-01', '2026-01-03');
    expect(problem).toMatchObject({ code: 'reportPeriod.tooLong', params: { days: 367 } });
    expect(reportPeriodProblem('2024-01-01', '2025-01-02')?.code).toBe('reportPeriod.tooLong');
    await expectTranslated(problem ?? fail());
  });

  it('should refuse an end before the start', async () => {
    const problem = reportPeriodProblem('2026-10-10', '2026-10-09');
    expect(problem?.code).toBe('reportPeriod.endBeforeStart');
    await expectTranslated(problem ?? fail());
  });

  it('should leave an incomplete period to the required rule', () => {
    expect(reportPeriodProblem(null, '2026-10-10')).toBeNull();
    expect(reportPeriodProblem('2026-10-10', '')).toBeNull();
    expect(reportPeriodProblem('10/10/2026', '2026-10-12')).toBeNull();
  });
});

function fail(): never {
  throw new Error('expected a problem');
}

describe('report types', () => {
  it('should ask every type but the incident report for a period', () => {
    expect(typesWith('period')).not.toContain('incident');
    expect(typesWith('incident')).toEqual(['incident']);
    expect(typesWith('segments')).toEqual(['segment']);
    expect(typesWith('facilities').sort()).toEqual(['attendance', 'device_health', 'flow', 'heatmap', 'incident_summary', 'occupancy']);
    for (const shape of Object.values(REPORT_TYPE_SHAPES)) expect(shape.period).toBe(!shape.incident);
  });

  const values = {
    title: '  October  ',
    description: ' ',
    format: 'csv',
    start_date: '2026-10-01',
    end_date: '2026-10-07',
    incident_id: INCIDENT,
    facility_ids: [FACILITY, FACILITY],
    segment_ids: [SEGMENT],
    timezone: 'Europe/Moscow',
  };

  it('should keep only what each type is made from', () => {
    expect(newReportInput({ ...values, report_type: 'occupancy' })).toEqual({
      reportType: 'occupancy',
      title: 'October',
      description: null,
      format: 'csv',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      incidentId: null,
      timezone: 'Europe/Moscow',
      facilityIds: [FACILITY],
      segmentIds: [],
    });
    expect(newReportInput({ ...values, report_type: 'segment' })).toMatchObject({ facilityIds: [], segmentIds: [SEGMENT], incidentId: null });
    expect(newReportInput({ ...values, report_type: 'compliance' })).toMatchObject({ facilityIds: [], segmentIds: [], startDate: '2026-10-01' });
    expect(newReportInput({ ...values, report_type: 'incident' })).toMatchObject({
      incidentId: INCIDENT,
      startDate: null,
      endDate: null,
      facilityIds: [],
      segmentIds: [],
    });
  });

  it('should insert the targets nested in the report, in one statement', () => {
    const object = reportInsertObject(newReportInput({ ...values, report_type: 'occupancy', timezone: null }));
    expect(object).toMatchObject({
      report_type: 'occupancy',
      parameters: {},
      report_facilities: { data: [{ facility_id: FACILITY }] },
      report_segments: { data: [] },
    });
    expect(reportInsertObject(newReportInput({ ...values, report_type: 'heatmap' })).parameters).toEqual({ timezone: 'Europe/Moscow' });
  });
});

describe('new report flow', () => {
  const newReport = () =>
    runFlow(app, { resource: REPORT_RESOURCE, action: 'new_report' }, {
      user: ADMIN,
      mutations: { 'itap:create-report': [answer({ id: REPORT, code: 'REPORT-00042' })] },
    });

  it('should send a facility report with its period and facilities', async () => {
    const flow = (await newReport().open()).fill({
      report_type: 'occupancy',
      title: 'Last week',
      format: 'pdf',
      start_date: '2026-10-12',
      end_date: '2026-10-18',
      facility_ids: [FACILITY],
    });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { reportType: 'occupancy', startDate: '2026-10-12', endDate: '2026-10-18', facilityIds: [FACILITY], segmentIds: [], incidentId: null },
    });
  });

  it('should send an incident report with its incident and no period', async () => {
    const flow = (await newReport().open()).fill({ report_type: 'incident', title: 'Break-in', format: 'pdf', incident_id: INCIDENT });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { reportType: 'incident', incidentId: INCIDENT, startDate: null, endDate: null } });
  });

  it('should refuse a period over 366 days before sending (Review Focus 3)', async () => {
    const flow = (await newReport().open()).fill({
      report_type: 'flow',
      title: 'Too long',
      format: 'pdf',
      start_date: '2025-01-01',
      end_date: '2026-01-03',
    });
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('at most 367 days');
  });

  it('should refuse an end before the start before sending', async () => {
    const flow = (await newReport().open()).fill({
      report_type: 'segment',
      title: 'Backwards',
      format: 'pdf',
      start_date: '2026-10-10',
      end_date: '2026-10-01',
    });
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('The end date cannot be before the start date.');
  });

  it('should not send a period report without its dates', async () => {
    const flow = (await newReport().open()).fill({ report_type: 'compliance', title: 'No dates', format: 'pdf' });
    await flow.submit();
    flow.assertNotSubmitted();
  });
});

describe('retry flow (Review Focus 4)', () => {
  const row = (status: string) => ({ id: REPORT, code: 'REPORT-00010', title: 'Visit frequency', status, error: 'boom' });
  const retry = (record: Record<string, unknown>) =>
    runFlow(app, { resource: REPORT_RESOURCE, action: 'retry' }, {
      user: ADMIN,
      record,
      rows: { [REPORT_RESOURCE]: [record] },
      mutations: { 'itap:retry-report': [answer({ id: REPORT, status: 'queued' })] },
    });

  it('should retry a failed report through retry_report', async () => {
    const flow = await retry(row('failed')).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { reportId: REPORT } });
  });

  it('should not offer Retry on a report that has not failed', async () => {
    for (const status of ['queued', 'generating', 'completed', 'expired']) {
      (await retry(row(status)).open()).assertUnavailable();
    }
  });
});

describe('report refusals', () => {
  const failing = (message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({
              kind: 'sent',
              code: 'constraint-violation',
              message,
              details: [{ message, extensions: { code: 'constraint-violation' } }],
            } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const refused = (operation: string, message: string) =>
    failing(message).mutations?.custom?.({ kind: 'custom', resource: REPORTS_BINDING, operation, input: {} } as never, {} as never);

  it('should read the database refusals of a new report as sentences', async () => {
    await expect(
      refused('createReport', 'Check constraint violation. new row for relation "reports" violates check constraint "reports_period"'),
    ).rejects.toMatchObject({ kind: 'validation', code: 'reports_period' });
    await expect(
      refused('createReport', 'Foreign key violation. insert or update on table "report_facilities" violates foreign key constraint "report_facilities_facility_fkey"'),
    ).rejects.toMatchObject({ code: 'report_facilities_facility_fkey' });
  });

  it('should read the refusals of retry_report as sentences', async () => {
    await expect(refused('retryReport', 'Check constraint violation. report_not_failed')).rejects.toMatchObject({
      code: 'report_not_failed',
      details: { issues: [{ message: { default: expect.stringMatching(/no longer failed/) } }] },
    });
    await expect(refused('retryReport', 'Check constraint violation. report_not_found')).rejects.toMatchObject({ code: 'report_not_found' });
  });
});

describe('new report after a lost answer', () => {
  it('should look only at the member’s own reports of the title sent', async () => {
    newReportFlow.submit.input({ values: { report_type: 'compliance', title: 'Mine', format: 'pdf' } } as never);
    const list = vi.fn(async () => ({ data: [{ id: REPORT, created_at: new Date().toISOString() }] }));
    expect(await reportCreated({ data: { list } } as never)).toBe('applied');
    expect(JSON.stringify(list.mock.calls[0])).toContain('"field":"requested_by_me","op":"eq","value":true');
    list.mockResolvedValueOnce({ data: [] });
    expect(await reportCreated({ data: { list } } as never)).toBe('not-applied');
  });
});
