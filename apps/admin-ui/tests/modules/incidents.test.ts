import { type DataError, type Rule, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  INCIDENT_ACTIVITY_RESOURCE,
  INCIDENT_EVENT_HISTORY_RESOURCE,
  INCIDENT_IDENTITY_HISTORY_RESOURCE,
  INCIDENT_NOTE_RESOURCE,
  INCIDENT_RESOURCE,
} from '../../src/data/resource-names';
import { describeActivity } from '../../src/fields/incident-activity-details-format';
import { ACTION_REFUSALS } from '../../src/modules';
import { INCIDENT_SAVED_VIEWS } from '../../src/modules/monitoring/incident';
import { INCIDENT_EFFECTS } from '../../src/modules/monitoring/incident-ops';

/**
 * Incidents without the UI: each lifecycle step is offered only in the statuses its function
 * accepts, sends the incident (and the form's disposition, resolution, reason or format), and
 * reads the database's refusals as definite; a second "Acknowledge" on a stale page shows who
 * acknowledged it (plan 05 Review Focus 1); notes are their author's; the timeline is read only.
 */

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const ADMIN = { id: ME, roles: ['org_admin'] };
const INCIDENT = '77777777-7777-4777-8777-000000000001';
const STATUSES = ['open', 'acknowledged', 'investigating', 'resolved', 'closed'] as const;

const incident = (status: string, extra: Record<string, unknown> = {}) => ({
  id: INCIDENT,
  code: 'INCIDENT-00042',
  title: 'Loitering in the lobby',
  severity: 'high',
  status,
  escalation_step: 0,
  ...extra,
});

const changed = (status: string, by = 'Ada Admin') =>
  answer({ id: INCIDENT, code: 'INCIDENT-00042', status, acknowledged_by_name: by });

const flow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource: INCIDENT_RESOURCE, action }, {
    user: ADMIN,
    record,
    rows: { [INCIDENT_RESOURCE]: [record] },
    mutations: mutations as never,
  });

/** The statuses in which `action` is offered on an incident. */
async function offeredIn(action: string): Promise<string[]> {
  const offered: string[] = [];
  for (const status of STATUSES) {
    const run = await flow(action, incident(status)).open();
    try {
      run.assertUnavailable();
    } catch {
      offered.push(status);
    }
  }
  return offered;
}

beforeAll(async () => {
  await app.ready;
});

describe('lifecycle steps are offered where the function accepts them', () => {
  it('should offer each step in its statuses only', async () => {
    expect(await offeredIn('acknowledge')).toEqual(['open']);
    expect(await offeredIn('start_investigation')).toEqual(['open', 'acknowledged']);
    expect(await offeredIn('resolve')).toEqual(['open', 'acknowledged', 'investigating']);
    expect(await offeredIn('escalate')).toEqual(['open', 'acknowledged', 'investigating']);
    expect(await offeredIn('reopen')).toEqual(['resolved']);
    expect(await offeredIn('close')).toEqual(['resolved']);
    expect(await offeredIn('generate_report')).toEqual([...STATUSES]);
  });
});

describe('acknowledge (Review Focus 1)', () => {
  it('should acknowledge an open incident and say who took it on', async () => {
    const run = await flow('acknowledge', incident('open'), {
      'itap:acknowledge-incident': [changed('acknowledged')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { incidentId: INCIDENT } });
    expect(run.state.effects?.notify).toBe('INCIDENT-00042 is acknowledged by Ada Admin.');
  });

  it('should show the server’s outcome when someone else acknowledged it meanwhile, and refresh the incident and its timeline', async () => {
    // The page still shows "open"; the database answers the incident Grace acknowledged, unchanged.
    const run = await flow('acknowledge', incident('open'), {
      'itap:acknowledge-incident': [changed('acknowledged', 'Grace Operator')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.state.effects?.notify).toBe('INCIDENT-00042 is acknowledged by Grace Operator.');
    expect(INCIDENT_EFFECTS.map((e) => e.resource)).toEqual([INCIDENT_RESOURCE, INCIDENT_ACTIVITY_RESOURCE]);
  });
});

describe('steps with a form', () => {
  it('should resolve with the disposition and the resolution', async () => {
    const run = await flow('resolve', incident('investigating'), {
      'itap:resolve-incident': [changed('resolved')],
    }).open();
    run.fill({ disposition: 'false_positive', resolution: 'A cleaner on the night shift.' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({
      input: { incidentId: INCIDENT, disposition: 'false_positive', resolution: 'A cleaner on the night shift.' },
    });
  });

  it('should not resolve without a disposition', async () => {
    const run = await flow('resolve', incident('open'), { 'itap:resolve-incident': [changed('resolved')] }).open();
    await run.submit();
    run.assertNotSubmitted();
  });

  it('should escalate with the reason after the confirmation', async () => {
    const run = await flow('escalate', incident('acknowledged'), {
      'itap:escalate-incident': [changed('acknowledged')],
    }).open();
    run.fill({ reason: 'Nobody on site answers.' });
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { incidentId: INCIDENT, reason: 'Nobody on site answers.' } });
  });

  it('should queue an incident report and name its code', async () => {
    const run = await flow('generate_report', incident('closed'), {
      'itap:generate-incident-report': [answer({ id: 'r1', code: 'REPORT-00031', format: 'xlsx' })],
    }).open();
    run.fill({ format: 'xlsx' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { incidentId: INCIDENT, format: 'xlsx' } });
    expect(run.state.effects?.notify).toMatch(/^Report REPORT-00031 is queued\./);
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
  const call = (operation: string) => ({ kind: 'custom', resource: MONITORING_BINDING, operation, input: {} }) as never;
  const refused = (operation: string, code: string) =>
    providerFailing(`Check constraint violation. ${code}`).mutations?.custom?.(call(operation), {} as never);

  it('should read a step someone else made impossible as a definite refusal saying so', async () => {
    for (const operation of ['acknowledgeIncident', 'startInvestigation', 'resolveIncident', 'closeIncident']) {
      await expect(refused(operation, 'incident_invalid_transition'), operation).rejects.toMatchObject({
        kind: 'validation',
        code: 'incident_invalid_transition',
        details: { issues: [{ message: { default: expect.stringMatching(/Someone else moved.*Nothing was changed/) } }] },
      });
    }
  });

  it('should read the other refusals of the incident functions', async () => {
    await expect(refused('escalateIncident', 'incident_not_active')).rejects.toMatchObject({ code: 'incident_not_active' });
    await expect(refused('resolveIncident', 'incident_disposition_required')).rejects.toMatchObject({
      code: 'incident_disposition_required',
    });
    await expect(refused('generateIncidentReport', 'incident_not_found')).rejects.toMatchObject({
      kind: 'validation',
      code: 'incident_not_found',
    });
  });

  it('should read a member who is no longer active as a definite refusal naming it', async () => {
    const operations = ['acknowledgeIncident', 'startInvestigation', 'resolveIncident', 'closeIncident', 'escalateIncident', 'generateIncidentReport'];
    for (const operation of operations) {
      await expect(refused(operation, 'member_not_active:assigned_to'), operation).rejects.toMatchObject({
        kind: 'validation',
        code: 'member_not_active',
        details: { issues: [{ message: { default: expect.stringMatching(/no longer an active member.*Nothing was changed/) } }] },
      });
    }
  });
});

describe('what never changes', () => {
  const rulesOf = (name: string) => (app.registry.get(name) as { rules?: Rule[] }).rules ?? [];
  const denied = (name: string, action: string, record: Record<string, unknown>) =>
    rulesOf(name)
      .filter((r) => (r.target as { name?: string }).name === action)
      .some((r) => (r.when as (ctx: unknown) => boolean)({ record, user: { id: ME, roles: [], authenticated: true } }));

  it('should edit an incident until it is closed, and never delete one', () => {
    for (const status of ['open', 'acknowledged', 'investigating', 'resolved']) {
      expect(denied(INCIDENT_RESOURCE, 'edit', incident(status)), status).toBe(false);
    }
    expect(denied(INCIDENT_RESOURCE, 'edit', incident('closed'))).toBe(true);
    const def = app.registry.get(INCIDENT_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations?.delete).toBe(false);
  });

  it('should keep facility-less incidents when a facility is picked in the sidebar', () => {
    const def = app.registry.get(INCIDENT_RESOURCE) as { data?: { scope?: Record<string, unknown> } };
    expect(def.data?.scope?.facility).toEqual({ field: 'facility_id', empty: 'shared' });
  });

  it('should let only the author change or delete a note', () => {
    for (const action of ['edit', 'delete']) {
      expect(denied(INCIDENT_NOTE_RESOURCE, action, { author_id: ME })).toBe(false);
      expect(denied(INCIDENT_NOTE_RESOURCE, action, { author_id: 'someone-else' })).toBe(true);
    }
  });

  it('should keep the timeline and the other side’s links read only', () => {
    for (const name of [INCIDENT_ACTIVITY_RESOURCE, INCIDENT_EVENT_HISTORY_RESOURCE, INCIDENT_IDENTITY_HISTORY_RESOURCE]) {
      const def = app.registry.get(name) as { operations?: Record<string, boolean> };
      expect(def.operations, name).toMatchObject({ create: false, edit: false, delete: false });
    }
  });
});

describe('saved views and the timeline line', () => {
  it('should offer the operators’ views', () => {
    const byId = Object.fromEntries(INCIDENT_SAVED_VIEWS.map((view) => [view.id, view.state.filters]));
    const active = { field: 'status', op: 'in', value: ['open', 'acknowledged', 'investigating'] };
    expect(byId.open).toEqual([active]);
    expect(byId.unacknowledged).toEqual([{ field: 'acknowledged_at', op: 'isNull' }]);
    expect(byId.mine).toEqual([{ field: 'assigned_to_me', op: 'eq', value: true }, active]);
    expect(byId.critical).toEqual([{ field: 'severity', op: 'in', value: ['critical'] }, active]);
  });

  it('should describe each activity in one line', () => {
    expect(describeActivity('status_change', { from: null, to: 'open' })).toBe('Opened as Open');
    expect(describeActivity('status_change', { from: 'open', to: 'acknowledged' })).toBe('Open → Acknowledged');
    expect(
      describeActivity('status_change', {
        from: 'investigating',
        to: 'resolved',
        disposition: 'false_positive',
        resolution: 'A cleaner.',
      }),
    ).toBe('Investigating → Resolved (False alarm: A cleaner.)');
    expect(describeActivity('escalated', { step: 2, manual: true, reason: 'No answer', recipients: 3 })).toBe(
      'Step 2 by an operator, 3 notified: No answer',
    );
    expect(describeActivity('escalated', { step: 1, manual: false, reason: null })).toBe('Step 1 by the escalation policy');
    expect(describeActivity('assigned', { from: null, to: ME })).toBe('Assigned');
    expect(describeActivity('assigned', { from: ME, to: null })).toBe('Unassigned');
    expect(describeActivity('report_generated', { code: 'REPORT-00031', format: 'pdf' })).toBe('REPORT-00031 (PDF)');
    expect(describeActivity('note', { note_id: 'n1' })).toBe('');
    expect(describeActivity('status_change', 'not an object')).toBe('Opened as —');
  });
});
