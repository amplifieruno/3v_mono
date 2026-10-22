import { type Rule, defineResource, ref, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { notificationRuleTestBlock } from '../../blocks/notification-rule-test/notification-rule-test-block';
import { resourceByName } from '../../data/resource-by-name';
import {
  NOTIFICATION_DELIVERY_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
} from '../../data/resource-names';
import { notificationRuleFields } from './notification-rule-fields';

/** The columns of the rule lists (the list page, a group's, a template's and a policy's Rules tabs). */
export const NOTIFICATION_RULE_COLUMNS = ['code', 'name', 'priority', 'digest_mode', 'is_active', 'recipient_group_id', 'last_triggered_at'] as const;

/**
 * A rule that has notified is history (its deliveries name it; `notification_deliveries_rule_fkey`
 * refuses the delete): it is switched off, not deleted. A rule that never matched can be deleted
 * with its event types and channels.
 */
const RULE_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'delete' },
    deny: 'run',
    when: (ctx) => {
      const last = (ctx.record as { readonly last_triggered_at?: unknown } | undefined)?.last_triggered_at;
      return typeof last === 'string' && last !== '';
    },
    fallback: 'disable',
    reason: 'This rule has notified people: switch it off (Active) instead, so its deliveries keep their origin.',
  },
];

/**
 * Notification rules (`itap.notification_rules`): who is told about which events, how and when.
 * A rule fires on its event types (rows of their own), keeps the events its conditions accept
 * (`itap.notification-conditions`) and notifies its recipient group on its channels with its
 * template, at its priority, immediately or as a digest; it may hand an escalation policy to the
 * incident of the event. "Test rule" tries it against the latest events without sending anything.
 */
export const notificationRule = defineResource(NOTIFICATION_RULE_RESOURCE, {
  texts: {
    label: 'Notification rule',
    labelPlural: 'Notification rules',
    doc: {
      summary:
        'Decides who is told about which events: the event types and conditions it reacts to, the recipient group and channels, the template, the priority and whether matches are sent at once or as a digest.',
    },
  },
  basePath: '/notification-rules',
  section: NAV_SECTIONS.notifications,
  order: 10,
  icon: NAV_ICONS.notificationRules,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: notificationRuleFields,
  rules: RULE_RULES,
  actions: (r) => ({
    item: [
      r.action.modal(
        'test',
        { block: notificationRuleTestBlock, props: { ruleId: ref('record', 'id') }, host: 'sheet' },
        {
          texts: {
            label: 'Test rule',
            doc: {
              summary:
                'Tries the rule against the latest events, as if it were active: which would match and who would be told, on which channel. Nothing is sent or written.',
            },
          },
          icon: NAV_ICONS.testRule,
          surfaces: { default: 'menu', show: 'auto' },
        },
      ),
    ],
  }),
  views: {
    list: {
      columns: [...NOTIFICATION_RULE_COLUMNS],
      optionalColumns: ['conditions', 'template_id', 'escalation_policy_id'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['code', { field: 'name', op: 'contains' }] },
      filters: {
        pinned: ['is_active', 'priority'],
        fields: ['is_active', 'priority', 'digest_mode', 'recipient_group_id', 'template_id', 'escalation_policy_id', 'last_triggered_at'],
      },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } },
        { id: 'inactive', texts: 'Switched off', state: { filters: [{ field: 'is_active', op: 'eq', value: false }] } },
        { id: 'digests', texts: 'Digests', state: { filters: [{ field: 'digest_mode', op: 'in', value: ['hourly', 'daily'] }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'priority', 'is_active', 'digest_mode'])],
      body: (l) => {
        const byRule = [{ field: 'rule_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          l.tabs(
            [
              l.panel(
                [
                  'name',
                  'description',
                  'conditions',
                  l.grid(['recipient_group_id', 'template_id', 'escalation_policy_id']),
                  'last_triggered_at',
                  l.grid(['created_at', 'updated_at']),
                ],
                { key: 'details', texts: 'Details' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_RULE_EVENT_TYPE_RESOURCE)), {
                    key: 'rule-event-types',
                    // Also seeds "+ Create": a new event type belongs to this rule.
                    props: { where: [...byRule], columns: ['event_type', 'created_at'], open: 'none' },
                  }),
                ],
                { key: 'event-types', texts: 'Event types' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_RULE_CHANNEL_RESOURCE)), {
                    key: 'rule-channels',
                    props: { where: [...byRule], columns: ['channel', 'created_at'], open: 'none' },
                  }),
                ],
                { key: 'channels', texts: 'Channels' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_DELIVERY_RESOURCE)), {
                    key: 'rule-deliveries',
                    props: {
                      where: [...byRule],
                      columns: ['created_at', 'title', 'recipient_user_id', 'recipient_address', 'channel', 'status'],
                      open: 'page',
                    },
                  }),
                ],
                { key: 'deliveries', texts: 'Deliveries' },
              ),
            ],
            { key: 'sections' },
          ),
        ];
      },
    },
    create: {
      body: (l) => [
        'name',
        'description',
        'conditions',
        l.grid(['priority', 'digest_mode', 'is_active']),
        l.grid(['recipient_group_id', 'template_id', 'escalation_policy_id']),
      ],
    },
    edit: {
      header: (l) => [l.grid(['code'])],
      body: (l) => [
        'name',
        'description',
        'conditions',
        l.grid(['priority', 'digest_mode', 'is_active']),
        l.grid(['recipient_group_id', 'template_id', 'escalation_policy_id']),
      ],
    },
  },
});
