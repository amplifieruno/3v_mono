import { type FlowConfig, type FlowUnknownCheck, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { INTEGRATION_RESOURCE, INTEGRATION_SYNC_RUN_RESOURCE } from '../../data/resource-names';
import { cronField } from '../../fields/cron';
import { secret } from '../../fields/secret';
import { timezone } from '../../fields/timezone';
import { runIntegrationSync, setIntegrationSchedule, setIntegrationSecret } from './integration-ops';

type Row = Readonly<Record<string, unknown>>;

/**
 * Reads the integration again and asks `stored` of its `has_secret` (a lost answer of the secret
 * action). `record` is the row the flow opened on (or its re-read before sending): when it already
 * had `has_secret === stored`, the re-read cannot tell a landed request from one that never reached
 * the backend (an old secret was already stored), so the answer stays `unknown`.
 */
const secretStored =
  (stored: boolean): FlowUnknownCheck =>
  async ({ record, data }) => {
    const before = record as Row | null | undefined;
    const id = before?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    if (before?.has_secret === stored) return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(INTEGRATION_RESOURCE) as never, { id } as never);
      const has = (row as Row | null | undefined)?.has_secret;
      if (typeof has !== 'boolean') return 'unknown';
      return has === stored ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };

const secretFields = {
  secret: secret({
    required: true,
    texts: {
      label: 'New secret',
      description: 'Typed here once: it is stored encrypted and never shown again.',
      doc: {
        summary:
          'The credential the connector signs in with (API token, password). It is sent once to the platform, stored encrypted and never read back; setting a new one replaces the stored one.',
      },
    },
  }),
};

/**
 * "Set secret": a password box whose value goes to `set_integration_secret` only. The field is
 * sensitive (never kept in a form draft), the answer carries no secret, and nothing of it is put in
 * the URL or in storage. A lost answer is checked by reading `has_secret` again (setting the same
 * secret twice is harmless); it stays unknown when a secret was already stored before the flow
 * opened. G84: after a lost answer buro keeps the attempt in sessionStorage with an unsalted
 * SHA-256 of the request body, the secret included, for the tab’s life.
 */
export const setSecretFlow = {
  texts: {
    label: 'Set secret',
    notify: 'The secret is stored, encrypted. It is never shown again.',
    doc: { summary: 'Stores the integration’s credential (encrypted), replacing any stored one. The secret is write-only: nobody can read it back.' },
  },
  icon: NAV_ICONS.setSecret,
  surfaces: { default: 'menu', show: 'menu' },
  form: { fields: secretFields },
  submit: {
    mutation: setIntegrationSecret,
    retry: 'never',
    input: { integrationId: ref('record', 'id'), secret: ref('values', 'secret') },
    onUnknown: { check: secretStored(true) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof secretFields>;

/** "Clear secret": removes the stored credential (only offered while one is stored). */
export const clearSecretFlow = {
  texts: {
    label: 'Clear secret',
    confirm: 'Remove the stored secret? The connector can no longer sign in until a new secret is set.',
    notify: 'The secret is removed.',
    doc: { summary: 'Removes the stored credential, for example when it leaked or the integration is retired.' },
  },
  icon: NAV_ICONS.clearSecret,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  confirm: true,
  submit: {
    mutation: setIntegrationSecret,
    retry: 'never',
    input: { integrationId: ref('record', 'id'), secret: { kind: 'literal', value: null } },
    onUnknown: { check: secretStored(false) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** Check again after a lost "Run sync": a manual run of the integration started in the last two minutes. */
export const syncStarted: FlowUnknownCheck = async ({ record, data }) => {
  const id = (record as Row | null | undefined)?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: rows } = await data.list(
      resourceByName(INTEGRATION_SYNC_RUN_RESOURCE) as never,
      {
        filter: {
          and: [
            { field: 'integration_id', op: 'eq', value: id },
            { field: 'trigger', op: 'eq', value: 'manual' },
            { field: 'started_at', op: 'gte', value: new Date(Date.now() - 120_000).toISOString() },
          ],
        },
        pagination: { kind: 'offset', page: 1, pageSize: 1 },
      } as never,
    );
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "Run sync": queues a manual sync (`run_integration_sync`) and opens the new run, which follows the
 * background job until it ends with its counts. Not resent: a second send would start a second run
 * (refused while the first is running).
 */
export const runSyncFlow = {
  texts: {
    label: 'Run sync',
    notify: 'The sync started; its run shows what it read and wrote.',
    doc: {
      summary:
        'Starts a sync now, outside the schedule, and opens its run. An HR sync applies its fixture file to the profiles; the SIEM, building management and webhook connectors are stubs that count what they would send.',
    },
  },
  icon: NAV_ICONS.runSync,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  submit: {
    mutation: runIntegrationSync,
    retry: 'never',
    input: { integrationId: ref('record', 'id') },
    onUnknown: { check: syncStarted },
  },
  then: { notify: true, open: { resource: INTEGRATION_SYNC_RUN_RESOURCE, id: ref('result', 'run_id') } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

const scheduleFields = {
  cron: cronField({
    texts: {
      label: 'When',
      description: 'Leave empty for no schedule (syncs by hand only).',
      doc: { summary: 'When the integration syncs by itself, as a cron in the zone below (checked every 15 minutes, so a run starts up to 15 minutes late).' },
    },
  }),
  timezone: timezone({ texts: { label: 'Time zone', doc: { summary: 'The zone the cron is read in; UTC when empty.' } } }),
};

/**
 * "Schedule": the cron and zone of `config.schedule_cron` / `schedule_timezone`, with the cron's
 * sentence under the input; every other setting is kept. An empty cron removes the schedule.
 */
export const scheduleFlow = {
  texts: {
    label: 'Schedule',
    notify: 'The schedule is saved; the next run is planned within 15 minutes.',
    doc: { summary: 'Sets when the integration syncs by itself, or removes the schedule. A paused integration does not sync on its schedule.' },
  },
  icon: NAV_ICONS.integrationSchedule,
  surfaces: { default: 'menu', show: 'menu' },
  form: {
    fields: scheduleFields,
    initial: { cron: ref('record', 'config', 'schedule_cron'), timezone: ref('record', 'config', 'schedule_timezone') },
  },
  submit: {
    mutation: setIntegrationSchedule,
    input: {
      integrationId: ref('record', 'id'),
      cron: ref('values', 'cron'),
      timezone: ref('values', 'timezone'),
    },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof scheduleFields>;
