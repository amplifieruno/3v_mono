import { type DataError, type Rule, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  INCIDENT_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_RESOURCE,
  SHIFT_HANDOVER_RESOURCE,
  WATCH_LIST_ENTRY_RESOURCE,
  WATCH_LIST_IDENTITY_ENTRY_RESOURCE,
  WATCH_LIST_PROFILE_ENTRY_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { SHIFT_HANDOVER_CHECKS, SHIFT_HANDOVER_SAVED_VIEWS } from '../../src/modules/monitoring/shift-handover-fields';
import { HANDOVER_INCIDENT_COLUMNS } from '../../src/modules/monitoring/shift-handover-incidents';
import { incidentsLinked } from '../../src/modules/monitoring/shift-handover-flows';
import { HANDOVER_INCIDENT_EFFECTS } from '../../src/modules/monitoring/shift-handover-ops';
import { hexColorProblem } from '../../src/modules/monitoring/watch-list';
import { expectTranslated } from '../support/field-issues';

/**
 * Watch lists and shift handovers without the UI: an entry is created through the subject's own
 * resource, so its form never offers both a profile and an identity (nor neither); a handover is
 * changed by its sender and acknowledged by its recipient, until acknowledged; "Add open
 * incidents" passes the open incidents on and the next operator reads them with their status now
 * (plan 05 Review Focus 5).
 */

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const ADMIN = { id: ME, roles: ['org_admin'] };
const HANDOVER = '88888888-8888-4888-8888-000000000001';

const handover = (extra: Record<string, unknown> = {}) => ({
  id: HANDOVER,
  from_user_id: 'someone-else',
  to_user_id: ME,
  shift_started_at: '2026-10-22T06:00:00Z',
  shift_ended_at: '2026-10-22T14:00:00Z',
  summary: 'Lobby camera flickers.',
  acknowledged_at: null,
  addressed_to_me: true,
  sent_by_me: false,
  ...extra,
});

const flow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource: SHIFT_HANDOVER_RESOURCE, action }, {
    user: ADMIN,
    record,
    rows: { [SHIFT_HANDOVER_RESOURCE]: [record] },
    mutations: mutations as never,
  });

const rulesOf = (name: string) => (app.registry.get(name) as { rules?: Rule[] }).rules ?? [];
const denied = (name: string, action: string, record: Record<string, unknown>) =>
  rulesOf(name)
    .filter((r) => {
      const target = (r.target as { name?: string | readonly string[] }).name;
      return Array.isArray(target) ? target.includes(action) : target === action;
    })
    .some((r) => (r.when as (ctx: unknown) => boolean)({ record, user: { id: ME, roles: [], authenticated: true } }));

beforeAll(async () => {
  await app.ready;
});

describe('watch-list entries: one subject each', () => {
  type Opts = { readonly write?: string; readonly system?: boolean; readonly required?: boolean };
  const optsOf = (name: string): Record<string, Opts> =>
    Object.fromEntries(
      Object.entries((app.registry.get(name) as { fields: Record<string, { opts?: Opts }> }).fields).map(([field, def]) => [
        field,
        def.opts ?? {},
      ]),
    );
  const createFields = (name: string): string[] => {
    return Object.entries(optsOf(name))
      .filter(([, opts]) => opts.system !== true && opts.write !== 'never')
      .map(([field]) => field)
      .sort();
  };

  it('should offer a person’s entry with a profile and never an identity, and a face’s the other way round', () => {
    expect(createFields(WATCH_LIST_PROFILE_ENTRY_RESOURCE)).toEqual(['expires_at', 'profile_id', 'reason', 'watch_list_id']);
    expect(createFields(WATCH_LIST_IDENTITY_ENTRY_RESOURCE)).toEqual(['expires_at', 'identity_id', 'reason', 'watch_list_id']);
  });

  it('should require the subject on its create path', () => {
    const required = (name: string, field: string) => optsOf(name)[field]?.required;
    expect(required(WATCH_LIST_PROFILE_ENTRY_RESOURCE, 'profile_id')).toBe(true);
    expect(required(WATCH_LIST_IDENTITY_ENTRY_RESOURCE, 'identity_id')).toBe(true);
  });

  it('should create no entry from the all-entries list, where both subjects are read only', () => {
    const def = app.registry.get(WATCH_LIST_ENTRY_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations?.create).toBe(false);
    expect(optsOf(WATCH_LIST_ENTRY_RESOURCE).profile_id?.write).toBe('never');
    expect(optsOf(WATCH_LIST_ENTRY_RESOURCE).identity_id?.write).toBe('never');
  });

  it('should refuse a colour that is not #rrggbb, translated', async () => {
    expect(hexColorProblem('#d97706')).toBeNull();
    for (const empty of [null, undefined, '']) expect(hexColorProblem(empty)).toBeNull();
    for (const bad of ['red', '#abc', '#12345g', 12]) expect(hexColorProblem(bad)?.code, String(bad)).toBe('color.hex');
    const problem = hexColorProblem('red');
    if (problem !== null) await expectTranslated(problem);
  });
});

describe('shift handover: who may do what', () => {
  it('should let the recipient acknowledge an unacknowledged handover only', async () => {
    const run = await flow('acknowledge', handover(), {
      'itap:acknowledge-shift-handover': [answer({ id: HANDOVER, acknowledged_at: '2026-10-22T14:05:00Z' })],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { handoverId: HANDOVER } });
    expect(run.state.effects?.notify).toBe('Handover acknowledged: the shift is yours.');
    (await flow('acknowledge', handover({ acknowledged_at: '2026-10-22T14:05:00Z' })).open()).assertUnavailable();
    expect(denied(SHIFT_HANDOVER_RESOURCE, 'acknowledge', handover())).toBe(false);
    expect(denied(SHIFT_HANDOVER_RESOURCE, 'acknowledge', handover({ addressed_to_me: false }))).toBe(true);
  });

  it('should let only the sender change, delete or add incidents, until it is acknowledged', () => {
    const mine = handover({ sent_by_me: true, addressed_to_me: false });
    for (const action of ['edit', 'delete', 'add_open_incidents']) {
      expect(denied(SHIFT_HANDOVER_RESOURCE, action, mine), action).toBe(false);
      expect(denied(SHIFT_HANDOVER_RESOURCE, action, handover()), action).toBe(true);
      expect(denied(SHIFT_HANDOVER_RESOURCE, action, { ...mine, acknowledged_at: '2026-10-22T14:05:00Z' }), action).toBe(true);
    }
  });

  it('should refuse a shift that ends before it started', () => {
    const check = SHIFT_HANDOVER_CHECKS[0];
    const when = check?.when as (ctx: { values: Record<string, unknown> }) => boolean;
    expect(when({ values: { shift_started_at: '2026-10-22T06:00:00Z', shift_ended_at: '2026-10-22T05:59:00Z' } })).toBe(true);
    expect(when({ values: { shift_started_at: '2026-10-22T06:00:00Z', shift_ended_at: '2026-10-22T14:00:00Z' } })).toBe(false);
    expect(when({ values: { shift_started_at: '2026-10-22T06:00:00Z', shift_ended_at: null } })).toBe(false);
  });

  it('should offer the views of an operator coming on shift', () => {
    const byId = Object.fromEntries(SHIFT_HANDOVER_SAVED_VIEWS.map((view) => [view.id, view.state.filters]));
    expect(byId['waiting-for-me']).toEqual([
      { field: 'addressed_to_me', op: 'eq', value: true },
      { field: 'acknowledged_at', op: 'isNull' },
    ]);
    expect(byId['sent-by-me']).toEqual([{ field: 'sent_by_me', op: 'eq', value: true }]);
  });
});

describe('open incidents passed on (Review Focus 5)', () => {
  it('should add the open incidents in one step and say how many', async () => {
    const run = await flow('add_open_incidents', handover({ sent_by_me: true, addressed_to_me: false }), {
      'itap:add-open-incidents-to-handover': [answer({ added: 3 })],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { handoverId: HANDOVER } });
    expect(run.state.effects?.notify).toBe('Open incidents added to the handover: 3.');
  });

  it('should check a lost answer by the open incidents linked now, never vacuously', async () => {
    const check = async (open: string[], linked: string[]) => {
      const list = async (resource: { ref?: string }) => ({
        data: resource.ref === INCIDENT_RESOURCE ? open.map((id) => ({ id })) : linked.map((incident_id) => ({ incident_id })),
      });
      return incidentsLinked({ record: handover(), data: { list } } as never);
    };
    expect(await check(['i1', 'i2'], ['i1', 'i2', 'old'])).toBe('applied');
    expect(await check(['i1', 'i2'], ['i1'])).toBe('not-applied');
    // No incident being handled: the call could add nothing, so nothing proves it ran.
    expect(await check([], [])).toBe('not-applied');
    expect(await check([], ['old'])).toBe('not-applied');
  });

  it('should refresh both incident lists of the handover', () => {
    expect(HANDOVER_INCIDENT_EFFECTS.map((e) => e.resource)).toEqual([SHIFT_HANDOVER_INCIDENT_RESOURCE, SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE]);
  });

  it('should list each incident with its status now for the next operator', () => {
    expect(HANDOVER_INCIDENT_COLUMNS).toEqual(['incident_id', 'incident_id.title', 'incident_id.status', 'incident_id.severity']);
    const def = app.registry.get(SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations).toMatchObject({ create: false, edit: false, delete: false });
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
              code: 'constraint-violation',
              message,
              details: [{ message, extensions: { code: 'constraint-violation' } }],
            } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const refused = (operation: string, code: string) =>
    providerFailing(`Check constraint violation. ${code}`).mutations?.custom?.(
      { kind: 'custom', resource: MONITORING_BINDING, operation, input: {} } as never,
      {} as never,
    );

  it('should read the handover functions’ refusals as definite', async () => {
    await expect(refused('acknowledgeShiftHandover', 'handover_not_recipient')).rejects.toMatchObject({
      kind: 'validation',
      code: 'handover_not_recipient',
      details: { issues: [{ message: { default: expect.stringMatching(/Only the operator the shift is handed over to/) } }] },
    });
    for (const code of ['handover_not_found', 'handover_not_sender', 'handover_acknowledged']) {
      await expect(refused('addOpenIncidentsToHandover', code), code).rejects.toMatchObject({ kind: 'validation', code });
    }
  });

  it('should read a member who is no longer active as a definite refusal naming it', async () => {
    for (const operation of ['acknowledgeShiftHandover', 'addOpenIncidentsToHandover']) {
      await expect(refused(operation, 'member_not_active:to_user_id'), operation).rejects.toMatchObject({
        kind: 'validation',
        code: 'member_not_active',
        details: { issues: [{ message: { default: expect.stringMatching(/no longer an active member.*Nothing was changed/) } }] },
      });
    }
  });
});
