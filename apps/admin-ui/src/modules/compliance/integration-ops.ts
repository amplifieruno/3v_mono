import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { INTEGRATION_RESOURCE, INTEGRATION_SYNC_RUN_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

const NOTHING = ' Nothing was changed.';
const NO_RUN = ' No sync was started.';
const SESSION = 'Your session has no organization: sign in to an organization again.';

/** A reader over an action's codes (form-level issues); `invalid_input` keeps the backend's words. */
function actionRefusals(texts: Readonly<Record<string, string>>, tail: string): ActionRefusalReader {
  return ({ code, message }) => {
    const text = texts[code];
    if (text === undefined) return null;
    return [{ code, message: code === 'invalid_input' ? `${text} ${message}.${tail}` : text, path: [] }];
  };
}

/** What `set_integration_secret` answers before it stores anything (`apps/backend/src/actions/integrations.ts`). */
export const SECRET_REFUSALS: Readonly<Record<string, string>> = {
  integration_not_found: 'The integration no longer exists (or is not visible to you).' + NOTHING,
  encryption_not_configured:
    'The platform has no encryption key configured (AUTH_KEY_ENCRYPTION_KEY), so no secret can be stored: ask the platform operator.' + NOTHING,
  forbidden: 'Only an organization administrator can set an integration’s secret.' + NOTHING,
  no_organization: SESSION + NOTHING,
  invalid_input: 'The secret was refused (at most 4096 characters):',
};

/** What `run_integration_sync` answers before it queues a run. */
export const SYNC_REFUSALS: Readonly<Record<string, string>> = {
  integration_not_found: 'The integration no longer exists (or is not visible to you).' + NO_RUN,
  integration_paused: 'The integration is paused: make it active first (Edit → Status).' + NO_RUN,
  integration_sync_running: 'A sync of this integration is already running: wait for it to finish (its run is in the Sync runs tab).' + NO_RUN,
  forbidden: 'Only an organization administrator can start a sync.' + NO_RUN,
  no_organization: SESSION + NO_RUN,
  invalid_input: 'The request was not valid:',
};

/** What saving a schedule is refused with (`integrations_schedule_valid`, the status guard). */
export const SCHEDULE_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  integrations_schedule_valid: 'The schedule was refused: choose a cron the platform accepts and a known time zone.' + NOTHING,
  integrations_config_object: 'The settings are not a JSON object.' + NOTHING,
};

export const secretInput = z.object({ integrationId: z.string().uuid(), secret: z.string().nullable() });
const secretOutput = z.object({ integration_id: z.string(), has_secret: z.boolean() });

export const setSecretOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'setIntegrationSecret',
  {
    kind: 'mutation',
    document: `mutation SetIntegrationSecret($integration: uuid!, $secret: String) {
  set_integration_secret(integration_id: $integration, secret: $secret) { integration_id has_secret }
}`,
    variables: (input) => {
      const { integrationId, secret } = input as z.infer<typeof secretInput>;
      return { integration: integrationId, secret: secret === '' ? null : secret };
    },
    mapResult: (data) => rootOf(data, 'set_integration_secret'),
  },
  actionRefusals(SECRET_REFUSALS, NOTHING),
);

/**
 * The Hasura action `set_integration_secret(integration_id, secret?)`: stores the secret encrypted
 * (or clears it with `null`). The answer says only whether one is stored; the secret is never
 * read back, so nothing of it reaches a read, a cache or the URL.
 */
export const setIntegrationSecret = defineMutation('itap:set-integration-secret', {
  binding: setSecretOperation.binding,
  input: schema(secretInput),
  output: schema(secretOutput),
  effects: [{ resource: INTEGRATION_RESOURCE }],
});

export const syncInput = z.object({ integrationId: z.string().uuid() });
const syncOutput = z.object({ run_id: z.string(), integration_id: z.string(), status: z.string() });

export const runSyncOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'runIntegrationSync',
  {
    kind: 'mutation',
    document: `mutation RunIntegrationSync($integration: uuid!) {
  run_integration_sync(integration_id: $integration) { run_id integration_id status }
}`,
    variables: (input) => ({ integration: (input as z.infer<typeof syncInput>).integrationId }),
    mapResult: (data) => rootOf(data, 'run_integration_sync'),
  },
  actionRefusals(SYNC_REFUSALS, NO_RUN),
);

/** The Hasura action `run_integration_sync(integration_id)`: queues a manual run; `run_sync` applies it. */
export const runIntegrationSync = defineMutation('itap:run-integration-sync', {
  binding: runSyncOperation.binding,
  input: schema(syncInput),
  output: schema(syncOutput),
  effects: [{ resource: INTEGRATION_RESOURCE }, { resource: INTEGRATION_SYNC_RUN_RESOURCE }],
});

export const scheduleInput = z.object({
  integrationId: z.string().uuid(),
  cron: z.string().nullable(),
  timezone: z.string().nullable(),
});

/** The schedule keys to merge into `config`, or `null` when the schedule is removed (no cron). */
export function scheduleKeys(cron: string | null, timezone: string | null): { schedule_cron: string; schedule_timezone: string } | null {
  const expression = cron?.trim() ?? '';
  if (expression === '') return null;
  return { schedule_cron: expression, schedule_timezone: timezone === null || timezone === '' ? 'UTC' : timezone };
}

/**
 * Touches only the two schedule keys of `config`, so a concurrent edit of another setting is kept:
 * setting merges them (`_append`); removing deletes each with its own root field (Hasura refuses
 * `_append` with `_delete_key`, and more than one key per `_delete_key`, on one column). Root
 * fields of one mutation run in one transaction; `@include` picks the branch.
 */
export const scheduleOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'setIntegrationSchedule',
  {
    kind: 'mutation',
    document: `mutation SetIntegrationSchedule($id: uuid!, $schedule: jsonb!, $set: Boolean!, $clear: Boolean!) {
  set: update_integrations_by_pk(pk_columns: { id: $id }, _append: { config: $schedule }) @include(if: $set) { id config next_sync_at }
  clearCron: update_integrations_by_pk(pk_columns: { id: $id }, _delete_key: { config: "schedule_cron" }) @include(if: $clear) { id }
  clearZone: update_integrations_by_pk(pk_columns: { id: $id }, _delete_key: { config: "schedule_timezone" }) @include(if: $clear) { id config next_sync_at }
}`,
    variables: (input) => {
      const { integrationId, cron, timezone } = input as z.infer<typeof scheduleInput>;
      const keys = scheduleKeys(cron, timezone);
      return { id: integrationId, schedule: keys ?? {}, set: keys !== null, clear: keys === null };
    },
    mapResult: (data) => rootOf(data, 'set') ?? rootOf(data, 'clearZone') ?? null,
  },
  sqlRefusals(SCHEDULE_REFUSALS),
);

/** "Schedule": writes only `config.schedule_cron` / `schedule_timezone`; every other setting is untouched. */
export const setIntegrationSchedule = defineMutation('itap:set-integration-schedule', {
  binding: scheduleOperation.binding,
  input: schema(scheduleInput),
  output: schema(z.object({ id: z.string() }).passthrough().nullable()),
  effects: [{ resource: INTEGRATION_RESOURCE }],
});

export const INTEGRATION_OPERATIONS = [setSecretOperation, runSyncOperation, scheduleOperation];
