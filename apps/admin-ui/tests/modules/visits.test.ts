import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { VISIT_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';
import { VISIT_CHECKS, visitFields } from '../../src/modules/people/visit-fields';
import { visitSavedViews } from '../../src/modules/people/visit-views';

/**
 * Visits without the UI: what check-in, check-out and cancelling send and when each is offered
 * (Review Focus 5: no check-in of a cancelled or checked-out visit), the read-only columns, the
 * pickers' profile types, the window check, the saved views at a fixed moment, the facility scope and the database's
 * refusals reaching the form.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const VISIT = '99999999-9999-4999-8999-000000000001';

const scheduled = {
  id: VISIT,
  code: 'VISIT-00001',
  status: 'scheduled',
  badge_number: 'B-12',
  visitor_profile_id: 'v1',
  expected_start: '2026-10-22T09:00:00Z',
  expected_end: '2026-10-22T11:00:00Z',
};

const visitFlow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource: VISIT_RESOURCE, action }, {
    user: ADMIN,
    record,
    rows: { [VISIT_RESOURCE]: [record] },
    mutations: mutations as never,
  });

const changed = (status: string) => answer({ id: VISIT, code: 'VISIT-00001', status });

beforeAll(async () => {
  await app.ready;
});

describe('check-in', () => {
  it('should check a scheduled visit in with the badge prefilled from the visit', async () => {
    const flow = await visitFlow('check_in', scheduled, { 'itap:check-in-visit': [changed('checked_in')] }).open();
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { visitId: VISIT, badgeNumber: 'B-12' } });
  });

  it('should send the badge typed at the desk', async () => {
    const flow = await visitFlow('check_in', scheduled, { 'itap:check-in-visit': [changed('checked_in')] }).open();
    flow.fill({ badge_number: 'B-40' });
    await flow.submit();
    expect(flow.submitted[0]?.call).toMatchObject({ input: { visitId: VISIT, badgeNumber: 'B-40' } });
  });

  it('should not offer check-in on a cancelled, checked-out, checked-in or no-show visit (Review Focus 5)', async () => {
    for (const status of ['cancelled', 'checked_out', 'checked_in', 'no_show']) {
      (await visitFlow('check_in', { ...scheduled, status }).open()).assertUnavailable();
    }
  });
});

describe('check-out and cancelling', () => {
  it('should check a checked-in visit out after the confirmation', async () => {
    const flow = await visitFlow('check_out', { ...scheduled, status: 'checked_in' }, {
      'itap:check-out-visit': [changed('checked_out')],
    }).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { visitId: VISIT } });
  });

  it('should offer check-out on a checked-in visit only', async () => {
    for (const status of ['scheduled', 'checked_out', 'cancelled', 'no_show']) {
      (await visitFlow('check_out', { ...scheduled, status }).open()).assertUnavailable();
    }
  });

  it('should cancel a scheduled visit with the reason', async () => {
    const flow = await visitFlow('cancel', scheduled, { 'itap:cancel-visit': [changed('cancelled')] }).open();
    flow.fill({ reason: 'Host is ill' });
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { visitId: VISIT, reason: 'Host is ill' } });
  });

  it('should offer cancelling on a scheduled visit only', async () => {
    for (const status of ['checked_in', 'checked_out', 'cancelled', 'no_show']) {
      (await visitFlow('cancel', { ...scheduled, status }).open()).assertUnavailable();
    }
  });
});

describe('the visit resource', () => {
  it('should never write the status, the check-in/out times or the cancellation reason, and never delete', () => {
    for (const name of ['status', 'checked_in_at', 'checked_out_at', 'cancellation_reason', 'code'] as const) {
      const field = visitFields[name] as { opts: { system?: boolean; write?: string } };
      expect(field.opts.system === true || field.opts.write === 'never', name).toBe(true);
    }
    const resource = app.registry.get(VISIT_RESOURCE) as { operations?: { delete?: boolean } };
    expect(resource.operations?.delete).toBe(false);
  });

  it('should be narrowed by the sidebar facility, with no-facility visits shown under every facility', () => {
    const resource = app.registry.get(VISIT_RESOURCE) as { data?: { scope?: Record<string, unknown> } };
    expect(resource.data?.scope?.facility).toEqual({ field: 'facility_id', empty: 'shared' });
  });

  it('should offer visitor profiles as visitors and anyone but a visitor as hosts', () => {
    const candidates = (name: 'visitor_profile_id' | 'host_profile_id') =>
      (visitFields[name] as unknown as { opts: { candidates?: unknown } }).opts.candidates;
    expect(candidates('visitor_profile_id')).toEqual([{ field: 'profile_type', op: 'eq', value: 'visitor' }]);
    expect(candidates('host_profile_id')).toEqual([{ field: 'profile_type', op: 'ne', value: 'visitor' }]);
  });

  it('should refuse a window that does not end after it starts', () => {
    const when = VISIT_CHECKS[0]?.when as (ctx: { values: Record<string, unknown> }) => boolean;
    expect(when({ values: { expected_start: '2026-10-22T11:00:00Z', expected_end: '2026-10-22T11:00:00Z' } })).toBe(true);
    expect(when({ values: { expected_start: '2026-10-22T11:00:00Z', expected_end: '2026-10-22T10:00:00Z' } })).toBe(true);
    expect(when({ values: { expected_start: '2026-10-22T09:00:00Z', expected_end: '2026-10-22T11:00:00Z' } })).toBe(false);
    expect(when({ values: { expected_start: '', expected_end: '2026-10-22T11:00:00Z' } })).toBe(false);
  });
});

describe('saved views', () => {
  it('should fix today and now at the moment given', () => {
    const now = new Date(2026, 9, 22, 10, 30);
    const [today, expectedNow, noShows] = visitSavedViews(now);
    expect(today?.state.filters).toEqual([
      { field: 'expected_start', op: 'lt', value: new Date(2026, 9, 23).toISOString() },
      { field: 'expected_end', op: 'gte', value: new Date(2026, 9, 22).toISOString() },
    ]);
    expect(expectedNow?.state.filters).toEqual([
      { field: 'status', op: 'eq', value: 'scheduled' },
      { field: 'expected_start', op: 'lte', value: now.toISOString() },
      { field: 'expected_end', op: 'gte', value: now.toISOString() },
    ]);
    expect(noShows?.state.filters).toEqual([{ field: 'status', op: 'eq', value: 'no_show' }]);
  });
});

describe('refusals through the provider', () => {
  const providerFailing = (message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({
              kind: 'sent',
              code: 'permission-error',
              message,
              details: [{ message, extensions: { code: 'permission-error' } }],
            } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const call = (operation: string) => ({ kind: 'custom', resource: PEOPLE_BINDING, operation, input: {} }) as never;

  it('should read a status changed elsewhere as a definite refusal', async () => {
    for (const operation of ['checkInVisit', 'checkOutVisit', 'cancelVisit']) {
      const provider = providerFailing('Check constraint violation. visit_invalid_transition');
      await expect(provider.mutations?.custom?.(call(operation), {} as never)).rejects.toMatchObject({
        kind: 'validation',
        code: 'visit_invalid_transition',
        details: { issues: [{ message: { default: expect.stringMatching(/status changed in the meantime.*Nothing was changed/) } }] },
      });
    }
  });
});
