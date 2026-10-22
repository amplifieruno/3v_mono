import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { WEBHOOK_DELIVERY_RESOURCE } from '../../data/resource-names';
import { webhookDeliveryFields } from './webhook-delivery-fields';

export { webhookDeliveryFields };

/**
 * Webhook deliveries (`itap.webhook_deliveries`): every event POSTed to a webhook subscription,
 * with the request (body, signature) and the answer (status code, error) of its last attempt.
 * Written by the platform only, an append-only log: no create, edit or delete, no count on every
 * page (`count: 'manual'`, the mapping's `noAggregate`) and keyset paging.
 */
export const webhookDelivery = defineResource(WEBHOOK_DELIVERY_RESOURCE, {
  texts: {
    label: 'Webhook delivery',
    labelPlural: 'Webhook deliveries',
    doc: {
      summary:
        'One event POSTed to one webhook: the JSON body and its signature, how many attempts, the HTTP status the receiver answered and any error. A read-only log.',
    },
  },
  basePath: '/webhook-deliveries',
  section: NAV_SECTIONS.notifications,
  order: 90,
  icon: NAV_ICONS.webhookDeliveries,
  displayField: 'event_type',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: webhookDeliveryFields,
  views: {
    list: {
      columns: ['created_at', 'subscription_id', 'event_type', 'status', 'attempts', 'response_code', 'error'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: 25,
      filters: {
        pinned: ['status', 'subscription_id'],
        fields: ['status', 'subscription_id', 'event_type', 'response_code', 'created_at'],
      },
      savedViews: [
        { id: 'problems', texts: 'Failed', state: { filters: [{ field: 'status', op: 'in', value: ['failed', 'retrying'] }] } },
        { id: 'dead-letters', texts: 'Dead letters', state: { filters: [{ field: 'status', op: 'eq', value: 'dead_letter' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['status', 'event_type', 'created_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel([l.grid(['subscription_id', 'event_id']), 'signature', 'body'], { key: 'request', texts: 'Request' }),
            l.panel(
              [l.grid(['response_code', 'attempts']), l.grid(['sent_at', 'next_attempt_at']), 'error'],
              { key: 'response', texts: 'Response' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
