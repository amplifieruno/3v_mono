import { describe, expect, it } from 'vitest';
import { reportSteps } from '../../src/blocks/report-status/report-steps';
import { readReportParameters, withPeriod } from '../../src/fields/report-parameters';
import { REPORT_SCHEDULE_CHECKS } from '../../src/modules/analytics/report-schedule';
import { BUILT_IN_TEMPLATE_REASON, REPORT_TEMPLATE_RULES } from '../../src/modules/analytics/report-template';

/**
 * The parts around reports: the progress steps of a report, a template's period in its parameters,
 * the schedule's recipients rule (`report_schedules_recipients`) and the lock on built-in templates.
 */

const REPORT = '66666666-6666-4666-8666-000000000001';

describe('report progress steps', () => {
  const progress = (status: string, extra: Record<string, unknown> = {}) => ({
    id: REPORT,
    status,
    created_at: '2026-10-22T08:00:00Z',
    generated_at: null,
    updated_at: '2026-10-22T08:00:05Z',
    attempts: 1,
    attempts_at_retry: 0,
    error: null,
    ...extra,
  });
  const states = (status: string, extra?: Record<string, unknown>) => reportSteps(progress(status, extra)).map((s) => `${s.key}:${s.state}`);

  it('should follow a report from request to file or error', () => {
    expect(states('queued', { attempts: 0 })).toEqual(['requested:done', 'generating:todo', 'completed:todo']);
    expect(states('generating')).toEqual(['requested:done', 'generating:current', 'completed:todo']);
    expect(states('completed', { generated_at: '2026-10-22T08:00:04Z' })).toEqual(['requested:done', 'generating:done', 'completed:done']);
    expect(states('failed')).toEqual(['requested:done', 'generating:done', 'failed:failed']);
    expect(states('expired', { generated_at: '2026-10-22T08:00:04Z' })).toEqual([
      'requested:done',
      'generating:done',
      'completed:done',
      'expired:done',
    ]);
  });

  it('should count the attempts since the last retry', () => {
    const generating = reportSteps(progress('generating', { attempts: 4, attempts_at_retry: 3 }))[1];
    expect(generating?.attempt).toBe(1);
  });
});

describe('template parameters and schedules', () => {
  it('should read and set a template’s period, keeping other keys', () => {
    expect(readReportParameters({ period: 'previous_week', timezone: 'UTC' })).toEqual({ period: 'previous_week', timezone: 'UTC' });
    expect(readReportParameters({ period: 'yesterday' })).toEqual({ period: null, timezone: null });
    expect(readReportParameters(null)).toEqual({ period: null, timezone: null });
    expect(withPeriod({ timezone: 'UTC', period: 'previous_day' }, 'previous_month')).toEqual({ timezone: 'UTC', period: 'previous_month' });
    expect(withPeriod({ timezone: 'UTC', period: 'previous_day' }, null)).toEqual({ timezone: 'UTC' });
  });

  it('should require a recipient group unless the schedule delivers to webhooks', () => {
    const check = REPORT_SCHEDULE_CHECKS[0];
    const refuses = (values: Record<string, unknown>) => (check?.when as (ctx: { values: Record<string, unknown> }) => boolean)({ values });
    expect(refuses({ channel: 'email', recipient_group_id: null })).toBe(true);
    expect(refuses({ channel: 'in_app', recipient_group_id: '' })).toBe(true);
    expect(refuses({ channel: 'email', recipient_group_id: 'g1' })).toBe(false);
    expect(refuses({ channel: 'webhook', recipient_group_id: null })).toBe(false);
  });

  it('should lock built-in templates with the reason', () => {
    const rule = REPORT_TEMPLATE_RULES[0];
    const when = rule?.when as (ctx: { record: unknown }) => boolean;
    expect(when({ record: { id: 't1', is_system: true } })).toBe(true);
    expect(when({ record: { id: 't1', is_system: false } })).toBe(false);
    expect(rule?.reason).toBe(BUILT_IN_TEMPLATE_REASON);
  });
});
