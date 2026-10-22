import { type DataError, type Rule, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { MONITORING_BINDING } from '../../src/blocks/occupancy-now/occupancy-query';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  EVENT_RESOURCE,
  EVENT_RULE_RESOURCE,
  EVENT_RULE_SCOPE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
} from '../../src/data/resource-names';
import { severitiesFrom } from '../../src/enums/events';
import { ACTION_REFUSALS } from '../../src/modules';
import { EVENT_SAVED_VIEWS } from '../../src/modules/monitoring/event';
import { EVENT_RULE_SCOPE_CHECKS } from '../../src/modules/monitoring/event-rule-scope';

/**
 * Event rules without the UI: "Edit draft" opens the rule's draft, "Publish" is offered on an open
 * version only and "Roll back" on a superseded one, a published version cannot be edited or
 * discarded, a rule that was in force cannot be deleted, the database's refusals reach the form
 * (Review Focus 2: a version published meanwhile is refused clearly), one place per scope row,
 * and the event list's severity views.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const RULE = '99999999-9999-4999-8999-000000000001';
const VERSION = '99999999-9999-4999-8999-000000000002';

const rule = { id: RULE, code: 'RULE-00001', name: 'Lobby loitering', rule_type: 'loitering', is_enabled: true };
const version = (status: string) => ({ id: VERSION, rule_id: RULE, version: 2, status, severity: 'low', parameters: {} });

const flow = (resource: string, action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource, action }, {
    user: ADMIN,
    record,
    rows: { [resource]: [record] },
    mutations: mutations as never,
  });

const changed = (status: string) => answer({ id: VERSION, rule_id: RULE, version: 2, status });

beforeAll(async () => {
  await app.ready;
});

describe('edit draft', () => {
  it('should ask for the rule’s draft and open it for editing', async () => {
    const run = await flow(EVENT_RULE_RESOURCE, 'edit_draft', rule, {
      'itap:create-event-rule-draft': [changed('draft')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { ruleId: RULE } });
  });

  it('should be offered on a rule with a version in force too (the draft is copied from it)', async () => {
    const run = await flow(EVENT_RULE_RESOURCE, 'edit_draft', { ...rule, current_version_id: VERSION }, {
      'itap:create-event-rule-draft': [changed('draft')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
  });
});

describe('publish and roll back', () => {
  it('should publish an open version after the confirmation', async () => {
    for (const status of ['draft', 'pending_approval']) {
      const run = await flow(EVENT_RULE_VERSION_RESOURCE, 'publish', version(status), {
        'itap:publish-event-rule-version': [changed('published')],
      }).open();
      await run.submit();
      await run.accept();
      run.assertOutcome('success');
      expect(run.submitted[0]?.call).toMatchObject({ input: { versionId: VERSION } });
    }
  });

  it('should not offer publishing a published or superseded version', async () => {
    for (const status of ['published', 'superseded']) {
      (await flow(EVENT_RULE_VERSION_RESOURCE, 'publish', version(status)).open()).assertUnavailable();
    }
  });

  it('should offer rolling back to a superseded version only', async () => {
    const run = await flow(EVENT_RULE_VERSION_RESOURCE, 'rollback', version('superseded'), {
      'itap:publish-event-rule-version': [changed('published')],
    }).open();
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    for (const status of ['draft', 'pending_approval', 'published']) {
      (await flow(EVENT_RULE_VERSION_RESOURCE, 'rollback', version(status)).open()).assertUnavailable();
    }
  });
});

describe('history is never changed', () => {
  const rulesOf = (name: string) => (app.registry.get(name) as { rules?: Rule[] }).rules ?? [];
  const denied = (name: string, action: string, record: Record<string, unknown>) =>
    rulesOf(name)
      .filter((r) => (r.target as { name?: string }).name === action)
      .some((r) => (r.when as (ctx: { record: unknown }) => boolean)({ record }));

  it('should edit and discard an open version only', () => {
    for (const action of ['edit', 'delete']) {
      expect(denied(EVENT_RULE_VERSION_RESOURCE, action, version('draft')), action).toBe(false);
      expect(denied(EVENT_RULE_VERSION_RESOURCE, action, version('pending_approval')), action).toBe(false);
      expect(denied(EVENT_RULE_VERSION_RESOURCE, action, version('published')), action).toBe(true);
      expect(denied(EVENT_RULE_VERSION_RESOURCE, action, version('superseded')), action).toBe(true);
    }
  });

  it('should delete a rule never published only', () => {
    expect(denied(EVENT_RULE_RESOURCE, 'delete', { ...rule, current_version_id: null })).toBe(false);
    expect(denied(EVENT_RULE_RESOURCE, 'delete', { ...rule, current_version_id: VERSION })).toBe(true);
  });

  it('should never create a version except through "Edit draft"', () => {
    const def = app.registry.get(EVENT_RULE_VERSION_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations?.create).toBe(false);
  });

  it('should keep the event log read-only', () => {
    const def = app.registry.get(EVENT_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations).toMatchObject({ create: false, edit: false, delete: false });
  });
});

describe('refusals through the provider (Review Focus 2)', () => {
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

  it('should read a version published meanwhile as a definite refusal saying so', async () => {
    const provider = providerFailing('Check constraint violation. version_already_published');
    await expect(provider.mutations?.custom?.(call('publishEventRuleVersion'), {} as never)).rejects.toMatchObject({
      kind: 'validation',
      code: 'version_already_published',
      details: { issues: [{ message: { default: expect.stringMatching(/already the one in force.*Nothing was changed/) } }] },
    });
  });

  it('should read a discarded draft and a deleted rule as definite refusals', async () => {
    await expect(
      providerFailing('Check constraint violation. version_not_found').mutations?.custom?.(
        call('publishEventRuleVersion'),
        {} as never,
      ),
    ).rejects.toMatchObject({ kind: 'validation', code: 'version_not_found' });
    await expect(
      providerFailing('Check constraint violation. event_rule_not_found').mutations?.custom?.(
        call('createEventRuleDraft'),
        {} as never,
      ),
    ).rejects.toMatchObject({ kind: 'validation', code: 'event_rule_not_found' });
  });
});

describe('scope and saved views', () => {
  const scopeWrong = EVENT_RULE_SCOPE_CHECKS[0]?.when as (ctx: { values: Record<string, unknown> }) => boolean;

  it('should take exactly one place per scope row', () => {
    expect(scopeWrong({ values: { facility_id: 'f1', area_id: null } })).toBe(false);
    expect(scopeWrong({ values: { facility_id: null, area_id: 'a1' } })).toBe(false);
    expect(scopeWrong({ values: { facility_id: 'f1', area_id: 'a1' } })).toBe(true);
    expect(scopeWrong({ values: { facility_id: '', area_id: null } })).toBe(true);
  });

  it('should add and remove scope rows, never change them', () => {
    const def = app.registry.get(EVENT_RULE_SCOPE_RESOURCE) as { operations?: Record<string, boolean> };
    expect(def.operations?.edit).toBe(false);
  });

  it('should keep facility-less events (device, system) when a facility is picked in the sidebar', () => {
    const def = app.registry.get(EVENT_RESOURCE) as { data?: { scope?: Record<string, unknown> } };
    expect(def.data?.scope?.facility).toEqual({ field: 'facility_id', empty: 'shared' });
  });

  it('should filter the event views by the ordered severity scale', () => {
    expect(severitiesFrom('high')).toEqual(['high', 'critical']);
    const byId = Object.fromEntries(EVENT_SAVED_VIEWS.map((view) => [view.id, view.state.filters]));
    expect(byId.critical).toEqual([{ field: 'severity', op: 'eq', value: 'critical' }]);
    expect(byId['high-and-above']).toEqual([{ field: 'severity', op: 'in', value: ['high', 'critical'] }]);
    expect(byId['medium-and-above']).toEqual([{ field: 'severity', op: 'in', value: ['medium', 'high', 'critical'] }]);
  });
});
