import { type CheckDI, type DataError, type RuleContext, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { LEGAL_HOLD_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { holdsOf, noticeInput } from '../../src/modules/compliance/hold-notice-query';
import {
  LEGAL_HOLD_CHECKS,
  LEGAL_HOLD_RULES,
  START_FROZEN_REASON,
  endChangeProblem,
  holdActive,
  holdEnded,
  holdStarted,
} from '../../src/modules/compliance/legal-hold-rules';
import { HOLD_TARGET_RULES } from '../../src/modules/compliance/legal-hold-targets';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';

/**
 * Legal holds without the UI: a started hold's start is frozen (the field rule denies the edit,
 * so no input is offered: Review Focus 3); its end is only set or shortened; an ended hold's dates
 * are frozen; "End now" only on a hold in force; a target of a hold in force is not removed; the
 * timeline refusals read as sentences; the notice groups the matching targets by hold.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const HOLD = '99999999-9999-4999-8999-000000000030';
const PROFILE = '99999999-9999-4999-8999-000000000031';
const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const hold = (extra: Record<string, unknown> = {}) => ({ id: HOLD, name: 'Litigation', reason: 'Claim 42', starts_at: at(-24), ends_at: null, ...extra });

const ruleDenies = (target: { kind: string; name: string }, record: Record<string, unknown>, rules = LEGAL_HOLD_RULES) =>
  rules.some((rule) => {
    const names = Array.isArray(rule.target.name) ? rule.target.name : [rule.target.name];
    return rule.target.kind === target.kind && names.includes(target.name) && rule.when?.({ record } as RuleContext) === true;
  });

const checkFires = (id: string, values: Record<string, unknown>, record?: Record<string, unknown>) => {
  const found = LEGAL_HOLD_CHECKS.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  const when = found.when as (di: CheckDI) => boolean;
  return when({ values, saved: record ?? {}, record, changed: (name: string) => name in values, was: () => undefined } as unknown as CheckDI);
};

describe('the timeline of a hold', () => {
  it('should tell started, ended and in force apart', () => {
    expect(holdStarted(hold())).toBe(true);
    expect(holdStarted(hold({ starts_at: at(2) }))).toBe(false);
    expect(holdEnded(hold({ ends_at: at(-1) }))).toBe(true);
    expect(holdActive(hold({ ends_at: at(1) }))).toBe(true);
    expect(holdActive(hold({ ends_at: at(-1) }))).toBe(false);
    expect(holdActive(hold({ starts_at: at(1) }))).toBe(false);
  });

  it('should freeze the start of a started hold, with the reason, and leave a future one free (Review Focus 3)', () => {
    expect(ruleDenies({ kind: 'field', name: 'starts_at' }, hold())).toBe(true);
    expect(ruleDenies({ kind: 'field', name: 'starts_at' }, hold({ starts_at: at(5) }))).toBe(false);
    const rule = LEGAL_HOLD_RULES.find((r) => r.target.kind === 'field' && r.target.name === 'starts_at');
    expect(rule).toMatchObject({ deny: 'edit', fallback: 'disable', reason: START_FROZEN_REASON });
  });

  it('should freeze the end of an ended hold only', () => {
    expect(ruleDenies({ kind: 'field', name: 'ends_at' }, hold({ ends_at: at(-1) }))).toBe(true);
    expect(ruleDenies({ kind: 'field', name: 'ends_at' }, hold({ ends_at: at(1) }))).toBe(false);
  });

  it('should only set or shorten the end of a started hold', () => {
    const started = hold({ ends_at: at(48) });
    expect(endChangeProblem(started, at(24))).toBeNull();
    expect(endChangeProblem(started, at(72))).toBe('extended');
    expect(endChangeProblem(started, null)).toBe('cleared');
    expect(endChangeProblem(hold(), at(24))).toBeNull();
    expect(endChangeProblem(hold({ starts_at: at(5), ends_at: at(10) }), at(100))).toBeNull();
    expect(checkFires('holdEndExtended', { ends_at: at(72) }, started)).toBe(true);
    expect(checkFires('holdEndCleared', { ends_at: null }, started)).toBe(true);
    expect(checkFires('holdEndCleared', { ends_at: at(12) }, started)).toBe(false);
    expect(checkFires('holdEndPast', { ends_at: at(-2) }, started)).toBe(true);
  });

  it('should keep the end after the start', () => {
    expect(checkFires('holdPeriod', { starts_at: at(1), ends_at: at(0) })).toBe(true);
    expect(checkFires('holdPeriod', { starts_at: at(1), ends_at: at(2) })).toBe(false);
    expect(checkFires('holdPeriod', { ends_at: at(-48) }, hold())).toBe(true);
  });
});

describe('End now', () => {
  const end = (record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, { resource: LEGAL_HOLD_RESOURCE, action: 'end_now' }, {
      user: ADMIN,
      record,
      rows: { [LEGAL_HOLD_RESOURCE]: [record] },
      mutations: mutations as never,
    });

  it('should end a hold in force', async () => {
    const run = await end(hold(), { 'itap:end-legal-hold': [answer({ id: HOLD, ends_at: at(0) })] }).open();
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { holdId: HOLD } });
  });

  it('should not be offered once ended, and say why before the start', async () => {
    (await end(hold({ ends_at: at(-1) })).open()).assertUnavailable();
    (await end(hold({ starts_at: at(3) })).open()).assertDisabled(/has not started yet/);
  });
});

describe('targets', () => {
  it('should not remove a target while its hold is in force', () => {
    const target = (h: Record<string, unknown>) => ({ id: 't1', hold_id: HOLD, profile_id: PROFILE, hold: h });
    expect(ruleDenies({ kind: 'action', name: 'delete' }, target(hold()), HOLD_TARGET_RULES)).toBe(true);
    expect(ruleDenies({ kind: 'action', name: 'delete' }, target(hold({ ends_at: at(-1) })), HOLD_TARGET_RULES)).toBe(false);
    expect(ruleDenies({ kind: 'action', name: 'delete' }, target(hold({ starts_at: at(1) })), HOLD_TARGET_RULES)).toBe(false);
  });
});

describe('refusals', () => {
  it('should read the timeline and target refusals as sentences', async () => {
    const refused = async (operation: string, message: string) => {
      const custom = defineMutationHandler(async () =>
        Promise.reject({ kind: 'sent', code: 'permission-error', message, details: [{ message, extensions: { code: 'permission-error' } }] } satisfies DataError),
      );
      const provider = withActionRefusals(defineDataProvider({ mutations: { custom } }), ACTION_REFUSALS);
      const call = { kind: 'custom', resource: COMPLIANCE_BINDING, operation, input: {} } as never;
      return provider.mutations?.custom?.(call, {} as never).catch((e: unknown) => e);
    };
    expect(await refused('endLegalHold', 'Check constraint violation. legal_hold_ended')).toMatchObject({ kind: 'validation', code: 'legal_hold_ended' });
    expect(await refused('endLegalHold', 'Check constraint violation. legal_hold_end_extension')).toMatchObject({ kind: 'validation', code: 'legal_hold_end_extension' });
  });
});

describe('the hold notice', () => {
  it('should ask for the record and what it is linked to', () => {
    expect(noticeInput({ profileId: PROFILE })).toEqual({ profileIds: [PROFILE], identityIds: [], identityProfileIds: [PROFILE], incidentIds: [], facilityIds: [] });
    expect(noticeInput({ identityId: 'i1', linkedProfileId: PROFILE })).toEqual({ profileIds: [PROFILE], identityIds: ['i1'], identityProfileIds: [], incidentIds: [], facilityIds: [] });
    expect(noticeInput({ identityId: 'i1', linkedProfileId: null }).profileIds).toEqual([]);
    expect(noticeInput({ incidentId: 'x1', facilityId: 'f1' })).toMatchObject({ incidentIds: ['x1'], facilityIds: ['f1'] });
  });

  it('should group matching targets by hold, newest start first, with what matched', () => {
    const h = (id: string, starts: string) => ({ id, name: id, starts_at: starts, ends_at: null });
    const rows = [
      { profile_id: PROFILE, identity_id: null, incident_id: null, facility_id: null, hold: h('a', '2026-10-01T00:00:00Z') },
      { profile_id: null, identity_id: 'i1', incident_id: null, facility_id: null, hold: h('a', '2026-10-01T00:00:00Z') },
      { profile_id: null, identity_id: null, incident_id: null, facility_id: 'f1', hold: h('b', '2026-10-10T00:00:00Z') },
    ];
    expect(holdsOf(rows)).toEqual([
      { ...h('b', '2026-10-10T00:00:00Z'), via: ['facility'] },
      { ...h('a', '2026-10-01T00:00:00Z'), via: ['profile', 'identity'] },
    ]);
    expect(holdsOf('nonsense')).toEqual([]);
  });
});
