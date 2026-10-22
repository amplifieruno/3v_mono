import { type Rule, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { NOTIFICATION_RULE_RESOURCE, NOTIFICATION_TEMPLATE_RESOURCE } from '../../data/resource-names';
import { NOTIFICATION_RULE_COLUMNS } from './notification-rule';
import { NOTIFICATION_TEMPLATE_CHECKS, notificationTemplateFields } from './notification-template-fields';

const isSystem = (record: unknown): boolean => (record as { readonly is_system?: unknown } | undefined)?.is_system === true;

/** System templates are the platform's: the database lets an `org_admin` neither change nor delete them. */
const TEMPLATE_RULES: Rule[] = (['edit', 'delete'] as const).map((name) => ({
  target: { kind: 'action', name },
  deny: 'run',
  when: (ctx) => isSystem(ctx.record),
  fallback: 'disable',
  reason: 'A system template is provided by the platform and read only: create a template of your own with its text to change it.',
}));

/**
 * Notification templates (`itap.notification_templates`): the wording of notifications per
 * channel and language, with `{{name}}` placeholders filled when a notification is written. A rule
 * names one template; its name picks the variant per channel and recipient language. System
 * templates (escalation pages, the generic wording) are read only.
 */
export const notificationTemplate = defineResource(NOTIFICATION_TEMPLATE_RESOURCE, {
  texts: {
    label: 'Notification template',
    labelPlural: 'Notification templates',
    doc: {
      summary:
        'The wording of notifications, per channel and language, with placeholders for the event, the place, the person and the incident.',
    },
  },
  basePath: '/notification-templates',
  section: NAV_SECTIONS.notifications,
  order: 20,
  icon: NAV_ICONS.notificationTemplates,
  displayField: 'name',
  recordTitle: (record) =>
    typeof record.name === 'string' && typeof record.channel === 'string' && typeof record.locale === 'string'
      ? `${record.name} · ${record.channel} · ${record.locale}`
      : null,
  data: { provider: 'hasura' },
  fields: notificationTemplateFields,
  rules: TEMPLATE_RULES,
  checks: NOTIFICATION_TEMPLATE_CHECKS,
  views: {
    list: {
      columns: ['name', 'channel', 'locale', 'subject', 'is_system'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }, { field: 'subject', op: 'contains' }] },
      filters: { pinned: ['channel', 'locale'], fields: ['channel', 'locale', 'is_system'] },
      savedViews: [
        { id: 'own', texts: 'Our templates', state: { filters: [{ field: 'is_system', op: 'eq', value: false }] } },
        { id: 'system', texts: 'System templates', state: { filters: [{ field: 'is_system', op: 'eq', value: true }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['name', 'channel', 'locale', 'is_system'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(['subject', 'body', l.grid(['created_at', 'updated_at'])], { key: 'wording', texts: 'Wording' }),
            l.panel(
              [
                l.place(relatedList(resourceByName(NOTIFICATION_RULE_RESOURCE)), {
                  key: 'template-rules',
                  props: {
                    where: [{ field: 'template_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...NOTIFICATION_RULE_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'rules', texts: 'Rules that chose it' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: (l) => [l.grid(['name', 'channel', 'locale']), 'subject', 'body'] },
    edit: { body: (l) => [l.grid(['name', 'channel', 'locale']), 'subject', 'body'] },
  },
});
