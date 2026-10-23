import type { RuleContext } from '@burojs/core';
import { describe, expect, it } from 'vitest';
import { EXPORT_JOB_RESOURCE, INTEGRATION_RESOURCE } from '../../src/data/resource-names';
import { fieldMappingProblem, integrationConfigProblem } from '../../src/fields/integration-config';
import { ITAP_TABLES } from '../../src/modules';
import { exportFiltersProblem } from '../../src/modules/compliance/export-definition-fields';
import { EXPORT_JOB_RULES, ownedByOther } from '../../src/modules/compliance/export-job';
import { runExportOperation } from '../../src/modules/compliance/export-ops';
import { INTEGRATION_CHECKS, INTEGRATION_RULES } from '../../src/modules/compliance/integration';
import { runSyncOperation, scheduleOperation, scheduleKeys, setSecretOperation } from '../../src/modules/compliance/integration-ops';
import { expectTranslated } from '../support/field-issues';

/**
 * Integrations and exports without a screen: the secret is never selected and goes to the action
 * only; the schedule keeps every other setting; settings and filters are refused as the CHECKs do;
 * the actions' and the job insert's refusals read as sentences; only the owner gets the file.
 */

const user = (id: string) => ({ id }) as RuleContext['user'];
/** A rule's or check's `when` as a function (the declarations here are functions). */
const whenOf = (decl: { readonly when?: unknown } | undefined) => decl?.when as (context: unknown) => boolean;
const ctx = (record: Record<string, unknown>, id = 'user-1') => ({ record, user: user(id) }) as unknown as RuleContext;

describe('the integration secret', () => {
  it('should never be selected by the integration resource', () => {
    const fields = ITAP_TABLES[INTEGRATION_RESOURCE]?.selectFields ?? [];
    expect(fields).toContain('has_secret');
    expect(fields).not.toContain('secret');
  });

  it('should be sent as typed, and an empty one as a clear', () => {
    const variables = setSecretOperation.document.variables;
    expect(variables?.({ integrationId: 'i1', secret: 'test-secret-not-real-1' })).toEqual({ integration: 'i1', secret: 'test-secret-not-real-1' });
    expect(variables?.({ integrationId: 'i1', secret: '' })).toEqual({ integration: 'i1', secret: null });
    expect(variables?.({ integrationId: 'i1', secret: null })).toEqual({ integration: 'i1', secret: null });
  });

  it('should read the action’s refusals as sentences and pass others through', () => {
    const read = setSecretOperation.refusals;
    expect(read?.({ code: 'encryption_not_configured', message: 'x' }, {})?.[0]?.message).toMatch(/no encryption key/);
    expect(read?.({ code: 'internal', message: 'x' }, {})).toBeNull();
  });

  it('should offer Clear secret only while one is stored', () => {
    const clear = INTEGRATION_RULES.find((rule) => rule.target.kind === 'action' && rule.target.name === 'clear_secret');
    expect(whenOf(clear)(ctx({ id: 'i1', has_secret: false }))).toBe(true);
    expect(whenOf(clear)(ctx({ id: 'i1', has_secret: true }))).toBe(false);
  });
});

describe('Run sync', () => {
  it('should be disabled on a paused integration and read the refusals', () => {
    const run = INTEGRATION_RULES.find((rule) => rule.target.kind === 'action' && rule.target.name === 'run_sync');
    expect(whenOf(run)(ctx({ id: 'i1', status: 'paused' }))).toBe(true);
    expect(whenOf(run)(ctx({ id: 'i1', status: 'error' }))).toBe(false);
    const read = runSyncOperation.refusals;
    expect(read?.({ code: 'integration_sync_running', message: '' }, {})?.[0]?.message).toMatch(/already running/);
    expect(read?.({ code: 'integration_paused', message: '' }, {})?.[0]?.message).toMatch(/paused/);
  });
});

describe('the integration schedule', () => {
  it('should set or remove only the two schedule keys', () => {
    expect(scheduleKeys('0 2 * * *', 'Europe/Moscow')).toEqual({ schedule_cron: '0 2 * * *', schedule_timezone: 'Europe/Moscow' });
    expect(scheduleKeys(' 5 4 * * 1 ', null)).toEqual({ schedule_cron: '5 4 * * 1', schedule_timezone: 'UTC' });
    expect(scheduleKeys('', 'UTC')).toBeNull();
    const variables = scheduleOperation.document.variables;
    expect(variables?.({ integrationId: 'i1', cron: '0 2 * * *', timezone: 'UTC' })).toEqual({
      id: 'i1',
      schedule: { schedule_cron: '0 2 * * *', schedule_timezone: 'UTC' },
      set: true,
      clear: false,
    });
    expect(variables?.({ integrationId: 'i1', cron: null, timezone: null })).toEqual({ id: 'i1', schedule: {}, set: false, clear: true });
    // No whole-config write: merge, or one `_delete_key` per root field.
    const query = scheduleOperation.document.document;
    expect(query).not.toMatch(/_set/);
    expect(query.match(/_delete_key: \{ config: "schedule_(cron|timezone)" \}/g)).toHaveLength(2);
    expect(scheduleOperation.document.mapResult?.({ clearZone: { id: 'i1' } })).toEqual({ id: 'i1' });
  });

  it('should refuse settings the CHECKs refuse, with translatable issues', async () => {
    expect(integrationConfigProblem({ schedule_cron: '0 2 * * *', schedule_timezone: 'Europe/Moscow', fixture_file_id: '4c0b5be1-55f7-497e-9ff8-2a501f968536' })).toBeNull();
    for (const bad of [[], { schedule_cron: 'nightly' }, { schedule_timezone: '+03:00' }, { fixture_file_id: 'x' }]) {
      const problem = integrationConfigProblem(bad);
      expect(problem, JSON.stringify(bad)).not.toBeNull();
      if (problem !== null) await expectTranslated(problem);
    }
    expect(fieldMappingProblem({ GivenName: 'first_name' })).toBeNull();
    for (const bad of ['x', { GivenName: '' }]) {
      const problem = fieldMappingProblem(bad);
      expect(problem).not.toBeNull();
      if (problem !== null) await expectTranslated(problem);
    }
  });

  it('should refuse the platform’s error status on a form', () => {
    const check = INTEGRATION_CHECKS[0];
    expect(whenOf(check)({ values: { status: 'error' }, record: { status: 'active' } } as never)).toBe(true);
    expect(whenOf(check)({ values: { status: 'error' }, record: { status: 'error' } } as never)).toBe(false);
  });
});

describe('exports', () => {
  it('should refuse filters that are no object', async () => {
    expect(exportFiltersProblem({ status: { _eq: 'active' } })).toBeNull();
    const problem = exportFiltersProblem([1]);
    expect(problem).not.toBeNull();
    if (problem !== null) await expectTranslated(problem);
  });

  it('should read the job insert’s refusals as sentences', () => {
    const read = runExportOperation.refusals;
    expect(read?.({ code: 'constraint-violation', message: 'Check constraint violation. export_job_active' }, {})?.[0]?.message).toMatch(/still queued or running/);
    expect(read?.({ code: 'constraint-violation', message: 'Check constraint violation. export_owner_only' }, {})?.[0]?.message).toMatch(/Only the definition’s owner/);
  });

  it('should hide the file of another member’s job with the reason (Review Focus 4)', () => {
    expect(ownedByOther(ctx({ id: 'j1', requested_by: 'USER-1' }), 'requested_by')).toBe(false);
    expect(ownedByOther(ctx({ id: 'j1', requested_by: 'someone-else' }), 'requested_by')).toBe(true);
    const rule = EXPORT_JOB_RULES[0];
    expect(rule?.deny).toBe('view');
    expect(rule?.reason).toMatch(/Only the member who ran the export/);
    expect(ITAP_TABLES[EXPORT_JOB_RESOURCE]?.selectFields).toContain('requested_by');
  });
});
