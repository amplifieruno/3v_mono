import { type CheckDI, type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { DSR_RESOURCE, PROFILE_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { dsrFiled, newRequestOf, sending } from '../../src/modules/compliance/dsr-create-flows';
import { splitErasureHolds } from '../../src/modules/compliance/dsr-erasure-holds-query';
import { confirmationMismatch, erasureHoldsUnknown } from '../../src/modules/compliance/dsr-erasure-flow';
import { defaultDueAt, dueProblem, latestDueAt, receivedInFuture, requestDates } from '../../src/modules/compliance/dsr-dates';
import { stepLine } from '../../src/modules/compliance/dsr-step-format';
import { dsrPending, retainedOf } from '../../src/modules/compliance/dsr-steps-query';
import { confirmsCode, subjectOf } from '../../src/modules/compliance/dsr-subject-query';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';

/**
 * Data subject requests without the UI: the due date (30 days by default, at most 90, after the
 * receipt, which is never in the future); what each "new request" flow files; the erasure flow
 * files nothing without the person's code typed as confirmation (Review Focus 1); Reject, Complete
 * and Retry only where the database takes them; refusals read as sentences; the steps timeline's
 * sentences, the partial erasure's kept categories and holds.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const PROFILE = '99999999-9999-4999-8999-000000000041';
const REQUEST = '99999999-9999-4999-8999-000000000042';
const DAY = 86_400_000;
const RECEIVED = '2026-10-01T09:00:00.000Z';
const plus = (days: number) => new Date(Date.parse(RECEIVED) + days * DAY).toISOString();

describe('the due date', () => {
  it('should default to 30 days after receipt and allow at most 90', () => {
    expect(defaultDueAt(RECEIVED)).toBe(plus(30));
    expect(latestDueAt(RECEIVED)).toBe(plus(90));
    expect(dueProblem(RECEIVED, plus(45))).toBeNull();
    expect(dueProblem(RECEIVED, plus(90))).toBeNull();
    expect(dueProblem(RECEIVED, plus(91))).toBe('too-late');
    expect(dueProblem(RECEIVED, RECEIVED)).toBe('not-after-received');
    expect(dueProblem(RECEIVED, null)).toBeNull();
  });

  it('should refuse a receipt in the future beyond the clock skew', () => {
    const now = Date.parse(RECEIVED);
    expect(receivedInFuture(new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(receivedInFuture(new Date(now + 10 * 60_000).toISOString(), now)).toBe(true);
    expect(receivedInFuture(null, now)).toBe(false);
  });

  it('should send the default due date when none is chosen, and the chosen one otherwise', () => {
    expect(requestDates({ received_at: RECEIVED })).toEqual({ received_at: RECEIVED, due_at: plus(30) });
    expect(requestDates({ received_at: RECEIVED, due_at: plus(60) })).toEqual({ received_at: RECEIVED, due_at: plus(60) });
    const empty = requestDates({});
    expect(Date.parse(empty.due_at) - Date.parse(empty.received_at)).toBe(30 * DAY);
  });

  it('should file a request of its type with trimmed notes and its details', () => {
    expect(newRequestOf('rectification', { profile_id: PROFILE, received_at: RECEIVED, notes: '  By e-mail ' }, { request: 'Job title' })).toEqual({
      profile_id: PROFILE,
      request_type: 'rectification',
      received_at: RECEIVED,
      due_at: plus(30),
      notes: 'By e-mail',
      details: { request: 'Job title' },
    });
    expect(newRequestOf('access', { profile_id: PROFILE, notes: ' ' }).notes).toBeNull();
  });
});

describe('new request flows', () => {
  const filed = { 'itap:create-data-subject-request': [answer({ id: REQUEST, code: 'DSR-00042' })] };
  const person = { id: PROFILE, code: 'P-00042', first_name: 'Ada', last_name: 'Throwaway', erased_at: null };
  const start = (action: string) =>
    runFlow(app, { resource: DSR_RESOURCE, action }, { user: ADMIN, rows: { [PROFILE_RESOURCE]: [person] }, mutations: filed as never });

  it('should file an access request with the default due date', async () => {
    const flow = (await start('new_access').open()).fill({ profile_id: PROFILE, received_at: RECEIVED });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { profile_id: PROFILE, request_type: 'access', received_at: RECEIVED, due_at: plus(30), details: {} },
    });
  });

  it('should refuse a due date beyond 90 days before sending', async () => {
    const flow = (await start('new_portability').open()).fill({ profile_id: PROFILE, received_at: RECEIVED, due_at: plus(120) });
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('at most 90 days');
  });

  it('should keep the requested changes of a rectification', async () => {
    const flow = (await start('new_rectification').open()).fill({ profile_id: PROFILE, received_at: RECEIVED, requested_changes: ' Job title: Lead ' });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { request_type: 'rectification', details: { request: 'Job title: Lead' } } });
  });

  describe('erasure (Review Focus 1)', () => {
    it('should file nothing without the typed confirmation', async () => {
      const flow = (await start('new_erasure').open()).fill({ profile_id: PROFILE, received_at: RECEIVED });
      await flow.submit();
      flow.assertNotSubmitted();
    });

    it('should file nothing when the typed code is another person’s', async () => {
      const flow = (await start('new_erasure').open()).fill({ profile_id: PROFILE, received_at: RECEIVED, confirmation: 'P-00041' });
      await flow.submit();
      flow.assertNotSubmitted();
      expect(JSON.stringify(flow.state)).toContain('does not match the chosen person');
    });

    it('should gate on the chosen person’s code, read through the check’s data access', async () => {
      // runFlow's scripted reads key rows by a handle's `ref.id`; a check reads the profile by name
      // (`resourceByName`), so the gate is exercised with the runtime's data access shape here.
      const data = {
        one: async (_resource: unknown, key: { id: string }) => ({ data: key.id === PROFILE ? person : null }),
      } as unknown as CheckDI['data'];
      const mismatch = (values: Record<string, unknown>) => confirmationMismatch({ values, data } as Pick<CheckDI, 'values' | 'data'>);
      expect(await mismatch({ profile_id: PROFILE, confirmation: ' p-00042 ' })).toBe(false);
      expect(await mismatch({ profile_id: PROFILE, confirmation: 'P-00041' })).toBe(true);
      expect(await mismatch({ profile_id: PROFILE })).toBe(true);
      expect(await mismatch({ confirmation: 'P-00042' })).toBe(true);
      const failing = { one: async () => Promise.reject(new Error('offline')) } as unknown as CheckDI['data'];
      expect(await confirmationMismatch({ values: { profile_id: PROFILE, confirmation: 'P-00042' }, data: failing } as Pick<CheckDI, 'values' | 'data'>)).toBe(true);
    });

    it('should never send the typed confirmation with the request', () => {
      expect(newRequestOf('erasure', { profile_id: PROFILE, received_at: RECEIVED, confirmation: 'P-00042' })).not.toHaveProperty('confirmation');
    });
  });

  it('should compare the typed code without case or spaces', () => {
    expect(confirmsCode(' p-00042 ', 'P-00042')).toBe(true);
    expect(confirmsCode('P-0004', 'P-00042')).toBe(false);
    expect(confirmsCode('P-00042', null)).toBe(false);
    expect(confirmsCode(undefined, 'P-00042')).toBe(false);
  });

  it('should read the subject with its identity count', () => {
    expect(
      subjectOf({ id: PROFILE, code: 'P-1', first_name: 'A', last_name: 'B', erased_at: null, processing_restricted: false, identities_aggregate: { aggregate: { count: 2 } } }),
    ).toMatchObject({ identities: 2 });
    expect(subjectOf(null)).toBeNull();
  });
});

describe('closing a request', () => {
  const request = (extra: Record<string, unknown>) => ({ id: REQUEST, code: 'DSR-00042', request_type: 'rectification', status: 'in_progress', last_error: null, ...extra });
  const run = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, { resource: DSR_RESOURCE, action }, { user: ADMIN, record, rows: { [DSR_RESOURCE]: [record] }, mutations: mutations as never });

  it('should reject an open request with its reason', async () => {
    const flow = (await run('reject', request({ status: 'received' }), { 'itap:reject-data-subject-request': [answer({ id: REQUEST, status: 'rejected' })] }).open()).fill({
      reason: 'Identity not verified',
    });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { requestId: REQUEST, reason: 'Identity not verified' } });
    (await run('reject', request({ status: 'completed' })).open()).assertUnavailable();
  });

  it('should complete only a rectification in progress', async () => {
    const flow = (await run('complete', request({}), { 'itap:complete-data-subject-request': [answer({ id: REQUEST, status: 'completed' })] }).open()).fill({
      outcome: 'Job title corrected',
    });
    await flow.submit();
    flow.assertOutcome('success');
    (await run('complete', request({ request_type: 'access' })).open()).assertUnavailable();
    (await run('complete', request({ status: 'received' })).open()).assertUnavailable();
  });

  it('should offer Retry only when the job gave up', async () => {
    const flow = await run('retry', request({ last_error: 'max_attempts' }), { 'itap:retry-data-subject-request': [answer({ id: REQUEST, status: 'in_progress' })] }).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    (await run('retry', request({ last_error: 'storage_unavailable' })).open()).assertUnavailable();
  });

  it('should read the closing refusals as sentences', async () => {
    const refused = async (operation: string, message: string) => {
      const custom = defineMutationHandler(async () =>
        Promise.reject({ kind: 'sent', code: 'permission-error', message, details: [{ message, extensions: { code: 'permission-error' } }] } satisfies DataError),
      );
      const provider = withActionRefusals(defineDataProvider({ mutations: { custom } }), ACTION_REFUSALS);
      const call = { kind: 'custom', resource: COMPLIANCE_BINDING, operation, input: {} } as never;
      return provider.mutations?.custom?.(call, {} as never).catch((e: unknown) => e);
    };
    expect(await refused('retryDataSubjectRequest', 'Check constraint violation. dsr_not_failed')).toMatchObject({ kind: 'validation', code: 'dsr_not_failed' });
    expect(await refused('rejectDataSubjectRequest', 'Check constraint violation. dsr_closed')).toMatchObject({ kind: 'validation', code: 'dsr_closed' });
    expect(await refused('createDataSubjectRequest', 'Check constraint violation. new row violates check constraint "data_subject_requests_due_window"')).toMatchObject({
      kind: 'validation',
    });
  });
});

describe('the steps', () => {
  const step = (name: string, details: Record<string, unknown> = {}) => ({ id: name, step: name, at: RECEIVED, details });

  it('should word each step with what it names', () => {
    expect(stepLine(step('purged', { class: 'detections', affected: 3, held: 2, files_enqueued: 1 }))).toEqual({
      key: 'step_purged_held',
      params: { dataClass: 'detections', affected: 3, held: 2, files: 1 },
      tone: 'warning',
    });
    expect(stepLine(step('purged', { class: 'events', affected: 0, held: 0 })).key).toBe('step_purged');
    expect(stepLine(step('completed', { partial: true }))).toMatchObject({ key: 'step_completed_partial', tone: 'warning' });
    expect(stepLine(step('rejected', { reason: 'subject_not_found' }))).toMatchObject({ key: 'step_rejected_reason', params: { reason: 'subject_not_found' } });
    expect(stepLine(step('gave_up', { attempts: 5 }))).toMatchObject({ key: 'step_gave_up', tone: 'failed' });
    expect(stepLine(step('awaiting_rectification')).key).toBe('step_awaiting_rectification');
    expect(stepLine(step('something_new'))).toMatchObject({ key: 'step_other', params: { step: 'something_new' } });
  });

  it('should read what a partial erasure kept and which holds kept it', () => {
    const steps = [step('purged'), step('retained', { categories: ['detections', 'profile', 'identities'], hold_ids: ['h1'] }), step('completed', { partial: true })];
    expect(retainedOf(steps)).toEqual({ categories: ['detections', 'profile', 'identities'], holdIds: ['h1'] });
    expect(retainedOf([step('completed')])).toBeNull();
  });

  it('should follow the request only while the job works on it', () => {
    expect(dsrPending({ status: 'received', lease_expires_at: null })).toBe(true);
    expect(dsrPending({ status: 'in_progress', lease_expires_at: RECEIVED })).toBe(true);
    expect(dsrPending({ status: 'in_progress', lease_expires_at: null })).toBe(false);
    expect(dsrPending({ status: 'completed', lease_expires_at: null })).toBe(false);
  });
});

describe('the erasure review’s holds (fix round 1)', () => {
  const hold = (id: string, via: string[]) => ({ id, name: id, starts_at: RECEIVED, ends_at: null, via });

  it('should tell holds on the person from holds on their incidents and facilities', () => {
    const split = splitErasureHolds([hold('p', ['profile']), hold('i', ['identity']), hold('x', ['incident']), hold('f', ['facility']), hold('both', ['facility', 'profile'])]);
    expect(split.person.map((h) => h.id)).toEqual(['p', 'i', 'both']);
    expect(split.places.map((h) => h.id)).toEqual(['x', 'f']);
  });

  it('should refuse to file while the holds cannot be read (fail closed)', async () => {
    const ok = { query: async () => [] } as unknown as CheckDI['data'];
    const failing = { query: async () => Promise.reject(new Error('offline')) } as unknown as CheckDI['data'];
    const unknown = (values: Record<string, unknown>, data: CheckDI['data']) => erasureHoldsUnknown({ values, data } as Pick<CheckDI, 'values' | 'data'>);
    expect(await unknown({ profile_id: PROFILE }, ok)).toBe(false);
    expect(await unknown({ profile_id: PROFILE }, failing)).toBe(true);
    expect(await unknown({}, failing)).toBe(false);
  });

  it('should check again only for the request its own flow sent', async () => {
    const data = { list: async () => ({ data: [{ id: REQUEST }] }) } as never;
    sending(newRequestOf('erasure', { profile_id: PROFILE, received_at: RECEIVED }));
    expect(await dsrFiled('erasure')({ data } as never)).toBe('applied');
    expect(await dsrFiled('portability')({ data } as never)).toBe('unknown');
  });
});
