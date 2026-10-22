import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { NOTIFICATION_DELIVERY_RESOURCE } from '../../data/resource-names';
import { notificationDeliveryFields } from './notification-delivery-fields';

export { notificationDeliveryFields };

/** Page size of the delivery lists. */
export const DELIVERY_PAGE_SIZE = 25;

/** The columns of the delivery log. */
export const DELIVERY_COLUMNS = ['created_at', 'title', 'status', 'channel', 'recipient_user_id', 'recipient_address', 'origin', 'attempts'] as const;

/** Saved views of the delivery log: what went wrong, and what was sent to me. */
export const DELIVERY_SAVED_VIEWS = [
  {
    id: 'failed',
    texts: 'Failed',
    state: { filters: [{ field: 'status', op: 'in', value: ['failed', 'retrying'] }] },
  },
  {
    id: 'dead-letters',
    texts: 'Dead letters',
    state: { filters: [{ field: 'status', op: 'eq', value: 'dead_letter' }] },
  },
  {
    id: 'mine',
    texts: 'Mine',
    state: { filters: [{ field: 'to_me', op: 'eq', value: true }] },
  },
];

/**
 * Notification deliveries (`itap.notification_deliveries`): every notification the platform
 * created, for whom, on which channel, from what, and how sending went. Written by the platform
 * only, an append-only log: no create, edit or delete, no count on every page (`count: 'manual'`,
 * the mapping's `noAggregate`) and keyset paging. Other members' subscription deliveries are
 * private and never listed (the database filters them).
 */
export const notificationDelivery = defineResource(NOTIFICATION_DELIVERY_RESOURCE, {
  texts: {
    label: 'Delivery',
    labelPlural: 'Deliveries',
    doc: {
      summary:
        'One notification to one recipient on one channel: what sent it (a rule, an escalation step, a subscription or a report), its status, attempts and error. A read-only log.',
    },
  },
  basePath: '/notification-deliveries',
  section: NAV_SECTIONS.notifications,
  order: 70,
  icon: NAV_ICONS.deliveries,
  displayField: 'title',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: notificationDeliveryFields,
  views: {
    list: {
      columns: [...DELIVERY_COLUMNS],
      optionalColumns: ['priority', 'rule_id', 'escalation_policy_id', 'event_id', 'incident_id', 'error'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: DELIVERY_PAGE_SIZE,
      search: { fields: [{ field: 'title', op: 'contains' }, { field: 'recipient_address', op: 'contains' }] },
      filters: {
        pinned: ['status', 'channel', 'origin'],
        fields: ['status', 'channel', 'origin', 'priority', 'recipient_user_id', 'rule_id', 'incident_id', 'to_me', 'created_at'],
      },
      savedViews: DELIVERY_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['status', 'channel', 'origin', 'created_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'title',
                l.grid(['recipient_user_id', 'recipient_address', 'priority']),
                l.panel([l.grid(['rule_id', 'escalation_policy_id', 'escalation_cycle']), l.grid(['subscription_id', 'report_id'])], {
                  key: 'origin',
                  texts: 'Origin',
                }),
                l.grid(['event_id', 'incident_id']),
                l.panel(
                  [
                    l.grid(['attempts', 'deliver_after', 'sent_at']),
                    l.grid(['delivered_at', 'acknowledged_at', 'digested_into']),
                    'error',
                  ],
                  { key: 'sending', texts: 'Sending' },
                ),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(['content'], { key: 'content', texts: 'Content' }),
            l.panel(
              [
                l.place(relatedList(resourceByName(NOTIFICATION_DELIVERY_RESOURCE)), {
                  key: 'digest-item-list',
                  props: {
                    where: [{ field: 'digested_into', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['created_at', 'title', 'status', 'event_id'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'digest-items', texts: 'Digest items' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
