import { type Check, type Rule, type RuleContext, defineResource, isRecordProbe, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { INTEGRATION_RESOURCE, INTEGRATION_SYNC_RUN_RESOURCE } from '../../data/resource-names';
import { integrationFields } from './integration-fields';
import { clearSecretFlow, runSyncFlow, scheduleFlow, setSecretFlow } from './integration-flows';
import { SYNC_RUN_COLUMNS } from './integration-sync-run';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const row = (ctx: Pick<RuleContext, 'record'>): Row => (isRecordProbe(ctx.record) ? null : (ctx.record as Row));

/** Why "Run sync" is not offered on a paused integration (`integration_paused`). */
export const PAUSED_REASON = 'The integration is paused: make it active (Edit → Status) to sync it.';

/**
 * - "Run sync" on a paused integration is refused by the platform: shown disabled with the reason.
 * - "Clear secret" only while a secret is stored.
 */
export const INTEGRATION_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'run_sync' },
    deny: 'run',
    when: (ctx) => row(ctx)?.status === 'paused',
    fallback: 'disable',
    reason: PAUSED_REASON,
  },
  {
    target: { kind: 'action', name: 'clear_secret' },
    deny: 'run',
    when: (ctx) => {
      const r = row(ctx);
      return typeof r?.id === 'string' && r.has_secret !== true;
    },
    fallback: 'hide',
  },
];

/** `integrations_status_guard`: the error status belongs to the platform. */
export const INTEGRATION_CHECKS: Check[] = [
  {
    id: 'integrationStatusSystemOnly',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'status',
    texts: 'Error is set by the platform when a sync fails: choose Active or Paused.',
    when: ({ values, record }) => values.status === 'error' && (record as Row)?.status !== 'error',
  },
];

const FORM = ['name', 'provider', 'direction', 'status', 'description', 'config', 'field_mapping'] as const;

/**
 * Integrations (`itap.integrations`): connectors to HR, SIEM, building management and other
 * systems, with their settings, field mapping, schedule (Schedule), write-only secret (Set secret,
 * Clear secret) and sync log (Run sync, Sync runs tab). The HR fixture sync is real; the outbound
 * connectors are stubs that count what they would send.
 */
export const integration = defineResource(INTEGRATION_RESOURCE, {
  texts: {
    label: 'Integration',
    labelPlural: 'Integrations',
    doc: {
      summary:
        'A connector to another system (HR, SIEM, building management, webhook): its settings, field mapping, schedule, write-only secret and the log of its syncs.',
    },
  },
  basePath: '/integrations',
  section: NAV_SECTIONS.compliance,
  order: 70,
  icon: NAV_ICONS.integrations,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: integrationFields,
  rules: INTEGRATION_RULES,
  checks: INTEGRATION_CHECKS,
  actions: (r) => ({
    item: [
      r.action.flow('run_sync', runSyncFlow),
      r.action.flow('schedule', scheduleFlow),
      r.action.flow('set_secret', setSecretFlow),
      r.action.flow('clear_secret', clearSecretFlow),
    ],
  }),
  views: {
    list: {
      columns: ['code', 'name', 'kind', 'provider', 'direction', 'status', 'has_secret', 'last_sync_at'],
      defaultSort: [{ field: 'code', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }, 'code'] },
      filters: { pinned: ['kind', 'status'], fields: ['kind', 'status', 'direction'] },
      savedViews: [{ id: 'error', texts: 'In error', state: { filters: [{ field: 'status', op: 'eq', value: 'error' }] } }],
    },
    show: {
      header: (l) => [l.grid(['code', 'kind', 'status', 'direction'])],
      body: (l) => [
        l.panel(['last_error'], {
          key: 'last-failure',
          tone: 'destructive',
          texts: { title: 'The last sync failed', description: 'The integration stays in error until a sync succeeds; its run says more.' },
          when: l.present(l.ref('record', 'last_error')),
        }),
        l.tabs(
          [
            l.panel(
              ['name', 'provider', 'description', l.grid(['has_secret', 'last_sync_at', 'next_sync_at']), 'config', 'field_mapping', l.grid(['created_by', 'created_at', 'updated_at'])],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(INTEGRATION_SYNC_RUN_RESOURCE)), {
                  key: 'integration-sync-runs',
                  props: { where: [{ field: 'integration_id', op: 'eq', value: l.ref('record', 'id') }], columns: [...SYNC_RUN_COLUMNS], open: 'page' },
                }),
              ],
              { key: 'runs', texts: 'Sync runs' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: () => ['kind', ...FORM] },
    edit: { body: (l) => [l.grid(['kind']), ...FORM] },
  },
});
