import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app/app-definition';
import { activeOverrides } from '../../src/app/active-overrides';
import { withActionRefusals } from '../../src/data/action-refusals';
import { EMERGENCY_OVERRIDE_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { decisionRecorded, testInput } from '../../src/modules/access/check-access-flow';
import { overrideTitle } from '../../src/modules/access/override';
import { endsAtProblem, justificationTooShort, overrideRanOut } from '../../src/modules/access/override-flows';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import type { TerminalStatus } from '../../src/modules/access/terminal-ops';
import { countStates, terminalState, terminalsOf } from '../../src/modules/access/terminal-sync-format';
import { PUBLISH_POLICY_ACTION, scopeFacility } from '../../src/modules/access/terminals-page';

/**
 * Emergency overrides and terminal sync without the UI: the start form restates the table's
 * CHECKs (justification of 10+ characters, an end within the next 24 hours) and sends what was
 * entered; "End now" needs a reason, is not offered once ended and is disabled once run out
 * (Review Focus 3); refusals read as sentences; a terminal's state against the rule set or an
 * override; the banner keeps overrides still deciding; "Publish policy to terminals" sends the
 * sidebar's facility; "Test access" checks a lost answer against database timestamps only.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const FACILITY = '99999999-9999-4999-8999-000000000010';
const OVERRIDE = '99999999-9999-4999-8999-000000000011';
const AREA = '99999999-9999-4999-8999-000000000012';
const DOOR = '99999999-9999-4999-8999-000000000013';
const PERSON = '99999999-9999-4999-8999-000000000014';
const HOUR = 3_600_000;

const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const override = (extra: Record<string, unknown> = {}) => ({
  id: OVERRIDE,
  facility_id: FACILITY,
  mode: 'lock_all',
  justification: 'Intruder reported in the lobby',
  started_at: inHours(-1),
  ends_at: inHours(1),
  ended_at: null,
  ...extra,
});

const status = (extra: Partial<TerminalStatus> = {}): TerminalStatus => ({
  device_id: 'd1',
  device_name: 'Turnstile 1',
  facility_id: FACILITY,
  status: 'active',
  health_status: 'healthy',
  reachable: true,
  synced_epoch: 12,
  synced_at: '2026-10-23T10:00:00Z',
  sync_error: null,
  epoch: 12,
  urgent_epoch: 12,
  epoch_lag: 0,
  urgent_pending: false,
  seconds_since_urgent: null,
  bound_seconds: 60,
  within_bound: true,
  ...extra,
});

beforeAll(async () => {
  await app.ready;
});

describe('starting an override', () => {
  const start = (mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, { resource: EMERGENCY_OVERRIDE_RESOURCE, action: 'start' }, { user: ADMIN, scope: { facility: FACILITY }, mutations: mutations as never });

  it('should refuse a short justification and an end outside the next 24 hours, then send what was entered', async () => {
    const run = await start({ 'itap:start-emergency-override': [answer({ id: OVERRIDE, mode: 'lock_all', ends_at: inHours(2), ended_at: null })] }).open();
    run.fill({ facility_id: FACILITY, mode: 'lock_all', area_ids: [AREA], justification: 'too short', ends_at: inHours(2) });
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ justification: '  Intruder reported in the lobby  ', ends_at: inHours(-1) });
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ ends_at: inHours(25) });
    await run.submit();
    run.assertNotSubmitted();
    const ends = inHours(2);
    run.fill({ ends_at: ends });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({
      input: { facilityId: FACILITY, mode: 'lock_all', justification: 'Intruder reported in the lobby', endsAt: ends, areaIds: [AREA] },
    });
    expect(run.state.effects?.open).toMatchObject({ resource: EMERGENCY_OVERRIDE_RESOURCE, id: OVERRIDE, mode: 'show' });
  });

  it('should mirror the database CHECKs', () => {
    expect(justificationTooShort(' 123456789 ')).toBe(true);
    expect(justificationTooShort('1234567890')).toBe(false);
    const now = Date.parse('2026-10-23T10:00:00Z');
    expect(endsAtProblem('2026-10-23T10:00:00Z', now)).toBe('past');
    expect(endsAtProblem('2026-10-24T10:00:00Z', now)).toBeNull();
    expect(endsAtProblem('2026-10-24T10:00:01Z', now)).toBe('tooLate');
  });

  it('should title an override by its mode’s enum label', () => {
    expect(overrideTitle('unlock_all')).toBe('Emergency override: Unlock all');
    expect(overrideTitle('evacuation')).toBe('Emergency override: Evacuation');
  });
});

describe('ending an override early (Review Focus 3)', () => {
  const end = (record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, { resource: EMERGENCY_OVERRIDE_RESOURCE, action: 'end' }, {
      user: ADMIN,
      record,
      rows: { [EMERGENCY_OVERRIDE_RESOURCE]: [record] },
      mutations: mutations as never,
    });

  it('should ask for a reason and send it', async () => {
    const run = await end(override(), {
      'itap:end-emergency-override': [answer({ id: OVERRIDE, mode: 'lock_all', ends_at: inHours(1), ended_at: inHours(0) })],
    }).open();
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ reason: '   ' });
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ reason: 'All clear' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { overrideId: OVERRIDE, reason: 'All clear' } });
  });

  it('should not offer End now on an ended override, and say why on one that ran out', async () => {
    (await end(override({ ended_at: inHours(-0.5) })).open()).assertUnavailable();
    (await end(override({ ends_at: inHours(-0.1) })).open()).assertDisabled(/has run out/);
    expect(overrideRanOut(override({ ends_at: inHours(-0.1), ended_at: inHours(-0.1) }))).toBe(false);
  });
});

describe('refusals', () => {
  const refused = async (operation: string, message: string, code = 'constraint-violation') => {
    const custom = defineMutationHandler(async () =>
      Promise.reject({ kind: 'sent', code, message, details: [{ message, extensions: { code } }] } satisfies DataError),
    );
    const provider = withActionRefusals(defineDataProvider({ mutations: { custom } }), ACTION_REFUSALS);
    const call = { kind: 'custom', resource: ACCESS_BINDING, operation, input: {} } as never;
    return provider.mutations?.custom?.(call, {} as never).catch((e: unknown) => e);
  };

  it('should read the start, end and publish refusals as sentences', async () => {
    expect(await refused('startEmergencyOverride', 'Check constraint violation. override_ends_at_invalid')).toMatchObject({
      kind: 'validation',
      code: 'override_ends_at_invalid',
    });
    expect(await refused('endEmergencyOverride', 'Check constraint violation. emergency_override_ended')).toMatchObject({
      kind: 'validation',
      code: 'emergency_override_ended',
    });
    expect(await refused('revokeAccessGrant', 'Check constraint violation. member_required')).toMatchObject({ kind: 'validation', code: 'member_required' });
    expect(await refused('publishPolicyToTerminals', 'Facility not found', 'facility_not_found')).toMatchObject({
      kind: 'validation',
      code: 'facility_not_found',
    });
  });
});

describe('terminal sync state', () => {
  it('should say where a terminal stands against the rule set', () => {
    expect(terminalState(status())).toBe('current');
    expect(terminalState(status({ synced_epoch: 10 }))).toBe('behind');
    expect(terminalState(status({ synced_epoch: null, synced_at: null }))).toBe('never');
    expect(terminalState(status({ synced_epoch: 10, reachable: false }))).toBe('unreachable');
  });

  it('should say whether a terminal has received an override or its end', () => {
    expect(terminalState(status({ synced_at: '2026-10-23T10:00:05Z' }), '2026-10-23T10:00:00Z')).toBe('received');
    expect(terminalState(status({ synced_at: '2026-10-23T09:59:59Z' }), '2026-10-23T10:00:00Z')).toBe('waiting');
    expect(terminalState(status({ synced_at: '2026-10-23T09:59:59Z', reachable: false }), '2026-10-23T10:00:00Z')).toBe('unreachable');
    const rows = [status(), status({ device_id: 'd2', facility_id: 'other' }), status({ device_id: 'd3', synced_at: null, reachable: false })];
    expect(terminalsOf(rows, FACILITY, null).map((r) => r.device_id)).toEqual(['d1', 'd3']);
    expect(terminalsOf(rows, null, 'd2').map((r) => r.device_id)).toEqual(['d2']);
    expect(countStates(terminalsOf(rows, FACILITY, null), '2026-10-23T09:00:00Z')).toMatchObject({ received: 1, unreachable: 1 });
  });

  it('should keep in the banner only overrides still deciding', () => {
    const now = Date.parse('2026-10-23T10:00:00Z');
    const rows = [
      { id: 'a', mode: 'lock_all', ends_at: '2026-10-23T11:00:00Z' },
      { id: 'b', mode: 'unlock_all', ends_at: '2026-10-23T09:59:00Z' },
    ];
    expect(activeOverrides(rows, now).map((r) => r.id)).toEqual(['a']);
  });
});

describe('Publish policy to terminals', () => {
  it('should publish to the facility selected in the sidebar, or to every facility', async () => {
    expect(scopeFacility({ facility: FACILITY })).toBe(FACILITY);
    expect(scopeFacility({ facility: null })).toBeNull();
    const run = await runFlow(app, { appAction: PUBLISH_POLICY_ACTION }, {
      user: ADMIN,
      scope: { facility: FACILITY },
      mutations: { 'itap:publish-policy-to-terminals': [answer({ terminals: [{ device_id: 'd1', result: 'synced', epoch: 12 }] })] } as never,
    }).open();
    // The review step hosts the answer; the push starts on its confirmation.
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { facilityId: FACILITY } });
    expect(run.state.effects?.open).toMatchObject({ props: { terminals: [{ device_id: 'd1', result: 'synced', epoch: 12 }] } });
  });
});

describe('Test access: a lost answer is checked against database timestamps', () => {
  it('should look for a decision after the door’s newest one when the dialog opened, never by the browser clock', async () => {
    const baseline = { latest: { id: 'dec-0', decided_at: '2026-10-23T10:00:00.123Z' } };
    testInput(DOOR, { profile_id: PERSON }, baseline);
    const list = vi.fn(async () => ({ data: [{ id: 'dec-1' }] }));
    expect(await decisionRecorded({ record: { id: DOOR }, data: { list } } as never)).toBe('applied');
    const filter = (list.mock.calls[0] as unknown as [unknown, { filter: { and: unknown[] } }])[1].filter.and;
    expect(filter).toEqual([
      { field: 'access_point_id', op: 'eq', value: DOOR },
      { field: 'decided_at', op: 'gte', value: '2026-10-23T10:00:00.123Z' },
      { field: 'id', op: 'ne', value: 'dec-0' },
      { field: 'profile_id', op: 'eq', value: PERSON },
    ]);

    testInput(DOOR, { profile_id: PERSON }, { latest: null });
    const none = vi.fn(async () => ({ data: [] }));
    expect(await decisionRecorded({ record: { id: DOOR }, data: { list: none } } as never)).toBe('not-applied');
    expect((none.mock.calls[0] as unknown as [unknown, { filter: { and: unknown[] } }])[1].filter.and).toEqual([
      { field: 'access_point_id', op: 'eq', value: DOOR },
      { field: 'profile_id', op: 'eq', value: PERSON },
    ]);
  });
});
