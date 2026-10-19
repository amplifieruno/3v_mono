import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { detectionCreated } from './detectionCreated.js';
import { closeStaleSessions, evaluateDwellRules } from './trackingCrons.js';
import type { CronTriggerPayload, EventTriggerPayload } from './types.js';

const env = {} as Env;

function eventPayload(row: Record<string, unknown> | null): EventTriggerPayload {
  return {
    id: 'delivery-1',
    trigger: { name: 'detection_created' },
    table: { schema: 'itap', name: 'detections' },
    event: { op: 'INSERT', session_variables: null, data: { old: null, new: row } },
  };
}

function cronPayload(name: string, scheduled = '2026-01-01T00:05:00+00:00'): CronTriggerPayload {
  return { id: 'run-1', name, scheduled_time: scheduled, payload: {} };
}

function fakeAdmin(orgs: string[], failFor: string[] = []) {
  const calls: { query: string; variables?: Record<string, unknown> }[] = [];
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    calls.push({ query, variables });
    if (query.includes('TrackingCronOrganizations')) return { organizations: orgs.map((id) => ({ id })) };
    const org = variables?.organization;
    if (typeof org === 'string' && failFor.includes(org)) throw new Error('hasura down');
    if (query.includes('evaluate_detection')) return { evaluate_detection: [{ id: 'e1' }, { id: 'e2' }] };
    if (query.includes('close_stale_sessions')) return { close_stale_sessions: [{ id: 's1' }] };
    return { evaluate_dwell_rules: [] };
  });
  return { admin: { request } as unknown as HasuraClient, calls };
}

describe('detection_created handler', () => {
  it('should call evaluate_detection with the inserted detection id and report the event count', async () => {
    const { admin, calls } = fakeAdmin([]);
    const result = await detectionCreated.handle(eventPayload({ id: 'det-1', organization_id: 'org-1' }), {
      env,
      admin,
      idempotencyKey: 'k',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain('evaluate_detection');
    expect(calls[0].variables).toEqual({ detection: 'det-1' });
    expect(result).toEqual({ detection_id: 'det-1', events: 2 });
  });

  it('should skip a payload without a detection id instead of retrying it', async () => {
    const { admin, calls } = fakeAdmin([]);
    const result = await detectionCreated.handle(eventPayload(null), { env, admin, idempotencyKey: 'k' });
    expect(calls).toEqual([]);
    expect(result).toEqual({ skipped: 'no_detection_id' });
  });
});

describe('tracking crons', () => {
  it('should close stale sessions per organization at the scheduled time', async () => {
    const { admin, calls } = fakeAdmin(['org-1', 'org-2']);
    const result = await closeStaleSessions.handle(cronPayload('close_stale_sessions'), { env, admin, idempotencyKey: 'k' });
    const perOrg = calls.filter((c) => c.query.includes('close_stale_sessions'));
    expect(perOrg.map((c) => c.variables)).toEqual([
      { organization: 'org-1', at: '2026-01-01T00:05:00.000Z' },
      { organization: 'org-2', at: '2026-01-01T00:05:00.000Z' },
    ]);
    expect(result).toEqual({ organizations: 2, rows: 2 });
  });

  it('should evaluate dwell rules for every organization and fail the run when one organization fails', async () => {
    const { admin, calls } = fakeAdmin(['org-1', 'org-2'], ['org-1']);
    await expect(
      evaluateDwellRules.handle(cronPayload('evaluate_dwell_rules'), { env, admin, idempotencyKey: 'k' }),
    ).rejects.toThrow(/1 of 2 organizations/);
    expect(calls.filter((c) => c.query.includes('evaluate_dwell_rules'))).toHaveLength(2);
  });

  it('should reject an invalid scheduled time', async () => {
    const { admin } = fakeAdmin(['org-1']);
    await expect(
      evaluateDwellRules.handle(cronPayload('evaluate_dwell_rules', 'not-a-date'), { env, admin, idempotencyKey: 'k' }),
    ).rejects.toThrow(/Invalid scheduled_time/);
  });
});
