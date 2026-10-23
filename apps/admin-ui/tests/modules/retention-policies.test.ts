import { type Check, type CheckDI, type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { RETENTION_POLICY_RESOURCE } from '../../src/data/resource-names';
import { RETENTION_ACTIONS, RETENTION_DATA_CLASSES } from '../../src/enums/compliance';
import { ACTION_REFUSALS } from '../../src/modules';
import { planMoment, planTotals } from '../../src/modules/compliance/retention-plan-query';
import {
  FACILITY_CLASSES,
  actionAllowed,
  allowedActions,
  belowFloor,
  classHasFacility,
  minRetainDays,
} from '../../src/modules/compliance/retention-classes';
import { RETENTION_POLICY_CHECKS } from '../../src/modules/compliance/retention-policy-fields';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';

/**
 * Retention policies without the UI: the class rules mirror the database helpers for every class
 * of the enum; the form's checks refuse a retention below the class floor, an action the class
 * does not take, a facility on an organization-only class and a second active policy for the
 * same scope; activation and Delete send what they should; the refusals the database answers
 * (measured on the dev stack) read as sentences; the plan's totals.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const POLICY = '99999999-9999-4999-8999-000000000020';
const FACILITY = '99999999-9999-4999-8999-000000000021';

const check = (id: string): Check => {
  const found = RETENTION_POLICY_CHECKS.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  return found;
};

const run = (id: string, values: Record<string, unknown>, extra: Partial<CheckDI> = {}) => {
  const when = check(id).when as (di: CheckDI) => boolean | Promise<boolean>;
  return when({ values, saved: {}, record: undefined, changed: () => true, was: () => undefined, ...extra } as unknown as CheckDI);
};

describe('class rules (mirror of itap.retention_* helpers)', () => {
  it('should know every class of the enum: actions, floor and facility dimension', () => {
    expect(RETENTION_DATA_CLASSES).toHaveLength(21);
    for (const dataClass of RETENTION_DATA_CLASSES) {
      expect(allowedActions(dataClass)).toContain('delete');
      expect(minRetainDays(dataClass)).toBeGreaterThanOrEqual(1);
    }
    expect(RETENTION_DATA_CLASSES.filter(classHasFacility)).toEqual([...FACILITY_CLASSES].sort((a, b) => RETENTION_DATA_CLASSES.indexOf(a) - RETENTION_DATA_CLASSES.indexOf(b)));
    expect(FACILITY_CLASSES).toHaveLength(8);
  });

  it('should hold the floors of audit and face authentication attempts', () => {
    expect(minRetainDays('audit')).toBe(365);
    expect(minRetainDays('auth_attempts')).toBe(365);
    expect(minRetainDays('auth_evidence')).toBe(1);
    expect(belowFloor('audit', 364)).toBe(true);
    expect(belowFloor('audit', 365)).toBe(false);
    expect(belowFloor('detections', 1)).toBe(false);
    expect(belowFloor('audit', undefined)).toBe(false);
  });

  it('should accept the actions per class', () => {
    expect(allowedActions('reports')).toEqual(['delete', 'archive']);
    expect(allowedActions('audit')).toEqual(['delete', 'anonymize']);
    expect(allowedActions('photos')).toEqual(['delete']);
    expect(actionAllowed('stats', 'anonymize')).toBe(false);
    expect(actionAllowed('bulk_jobs', 'archive')).toBe(true);
    expect(RETENTION_ACTIONS).toEqual(['delete', 'anonymize', 'archive']);
    expect(allowedActions('trigger_logs')).toEqual([]);
  });
});

describe('the policy form checks', () => {
  it('should refuse a retention below the class floor (create and edit)', () => {
    expect(run('retentionFloor', { data_class: 'audit', retain_days: 30 })).toBe(true);
    expect(run('retentionFloor', { retain_days: 30 }, { record: { data_class: 'auth_attempts' } })).toBe(true);
    expect(run('retentionFloor', { data_class: 'audit', retain_days: 400 })).toBe(false);
    expect(run('retentionFloor', { data_class: 'events', retain_days: 1 })).toBe(false);
  });

  it('should refuse an action the class does not take, and a facility on an organization-only class', () => {
    expect(run('retentionActionAllowed', { data_class: 'photos', action: 'anonymize' })).toBe(true);
    expect(run('retentionActionAllowed', { data_class: 'reports', action: 'archive' })).toBe(false);
    expect(run('retentionFacilityClass', { data_class: 'audit', facility_id: FACILITY })).toBe(true);
    expect(run('retentionFacilityClass', { data_class: 'detections', facility_id: FACILITY })).toBe(false);
    expect(run('retentionFacilityClass', { data_class: 'audit', facility_id: null })).toBe(false);
  });

  it('should refuse a second active policy for the same class and scope', async () => {
    const list = vi.fn<(resource: unknown, params: unknown) => Promise<{ data: unknown[] }>>(async () => ({ data: [{ id: 'other' }] }));
    const data = { list } as unknown as CheckDI['data'];
    expect(await run('retentionActiveScope', { data_class: 'detections', facility_id: FACILITY, is_active: true }, { data })).toBe(true);
    expect(list.mock.calls[0]?.[1]).toMatchObject({
      filter: {
        and: [
          { field: 'data_class', op: 'eq', value: 'detections' },
          { field: 'is_active', op: 'eq', value: true },
          { field: 'facility_id', op: 'eq', value: FACILITY },
        ],
      },
    });
    expect(await run('retentionActiveScope', { data_class: 'audit', is_active: true }, { data })).toBe(true);
    expect((list.mock.calls[1]?.[1] as unknown as { filter: { and: unknown[] } }).filter.and[2]).toEqual({ field: 'facility_id', op: 'isNull' });
    // Created inactive: nothing to compare with.
    expect(await run('retentionActiveScope', { data_class: 'audit', is_active: false }, { data })).toBe(false);
    const empty = { list: async () => ({ data: [] }) } as unknown as CheckDI['data'];
    expect(await run('retentionActiveScope', { data_class: 'audit', is_active: true }, { data: empty })).toBe(false);
  });
});

describe('activation and delete', () => {
  const flow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, { resource: RETENTION_POLICY_RESOURCE, action }, {
      user: ADMIN,
      record,
      rows: { [RETENTION_POLICY_RESOURCE]: [record] },
      mutations: mutations as never,
    });
  const policy = (extra: Record<string, unknown> = {}) => ({ id: POLICY, data_class: 'events', retain_days: 90, action: 'delete', is_active: true, ...extra });

  it('should offer Deactivate on an active policy only, and send it', async () => {
    (await flow('activate', policy()).open()).assertUnavailable();
    const deactivate = await flow('deactivate', policy(), { 'itap:set-retention-policy-active': [answer({ id: POLICY, is_active: false })] }).open();
    await deactivate.submit();
    await deactivate.accept();
    deactivate.assertOutcome('success');
    expect(deactivate.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY, active: false } });
  });

  it('should offer Activate on an inactive policy, and Delete through its own mutation', async () => {
    (await flow('deactivate', policy({ is_active: false })).open()).assertUnavailable();
    const activate = await flow('activate', policy({ is_active: false }), { 'itap:set-retention-policy-active': [answer({ id: POLICY, is_active: true })] }).open();
    await activate.submit();
    await activate.accept();
    activate.assertOutcome('success');
    expect(activate.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY, active: true } });
    const remove = await flow('delete', policy(), { 'itap:delete-retention-policy': [answer({ id: POLICY })] }).open();
    await remove.submit();
    await remove.accept();
    remove.assertOutcome('success');
    expect(remove.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY } });
  });
});

describe('refusals', () => {
  const refused = async (operation: string, message: string, code = 'permission-error') => {
    const custom = defineMutationHandler(async () =>
      Promise.reject({ kind: 'sent', code, message, details: [{ message, extensions: { code } }] } satisfies DataError),
    );
    const provider = withActionRefusals(defineDataProvider({ mutations: { custom } }), ACTION_REFUSALS);
    const call = { kind: 'custom', resource: COMPLIANCE_BINDING, operation, input: {} } as never;
    return provider.mutations?.custom?.(call, {} as never).catch((e: unknown) => e);
  };

  it('should read the database answers as sentences (messages as measured on the dev stack)', async () => {
    expect(
      await refused('setRetentionPolicyActive', 'Uniqueness violation. duplicate key value violates unique constraint "retention_policies_active_scope_key"', 'constraint-violation'),
    ).toMatchObject({ kind: 'validation', code: 'retention_policies_active_scope_key' });
    const floor = await refused(
      'setRetentionPolicyActive',
      'Check constraint violation. new row for relation "retention_policies" violates check constraint "retention_policies_retain_days"',
    );
    expect(JSON.stringify(floor)).toContain('at least 365 days');
    expect(
      await refused(
        'deleteRetentionPolicy',
        'Foreign key violation. update or delete on table "retention_policies" violates foreign key constraint "processing_activities_retention_policy_fkey" on table "processing_activities"',
        'constraint-violation',
      ),
    ).toMatchObject({ kind: 'validation', code: 'processing_activities_retention_policy_fkey' });
  });
});

describe('the retention plan', () => {
  it('should count the totals and look ahead from now', () => {
    const row = (candidates: number, held: number) => ({ data_class: 'events', facility_id: null, policy_id: POLICY, action: 'delete', retain_days: 90, cutoff: '2026-07-25T00:00:00Z', candidates, held });
    expect(planTotals([row(3, 1), row(4, 0)])).toEqual({ candidates: 7, held: 1 });
    const now = new Date('2026-10-23T10:00:00Z');
    expect(planMoment(0, now)).toBe('2026-10-23T10:00:00.000Z');
    expect(planMoment(30, now)).toBe('2026-11-22T10:00:00.000Z');
  });
});
