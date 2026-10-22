import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  WEBHOOK_DELIVERY_RESOURCE,
  WEBHOOK_SUBSCRIPTION_EVENT_TYPE_RESOURCE,
  WEBHOOK_SUBSCRIPTION_RESOURCE,
} from '../../data/resource-names';
import { webhookSubscriptionEventTypeFields, webhookSubscriptionFields } from './webhook-subscription-fields';

export { webhookSubscriptionEventTypeFields, webhookSubscriptionFields };

/** The columns of a webhook's Deliveries tab. */
const SUBSCRIPTION_DELIVERY_COLUMNS = ['created_at', 'event_type', 'status', 'attempts', 'response_code', 'error'] as const;

const FORM = ['url', 'secret', 'description', 'is_active'] as const;

/**
 * Webhook subscriptions (`itap.webhook_subscriptions`): another system (a SIEM, a building
 * system) told about events over HTTP. For each event of one of its event types (rows of their
 * own, added on the subscription's page) the platform POSTs the event as JSON to the URL, signed
 * with the secret, and keeps a delivery in the log. The URL is checked on save as the database
 * checks it; a private address is a warning, refused by the sender outside development.
 */
export const webhookSubscription = defineResource(WEBHOOK_SUBSCRIPTION_RESOURCE, {
  texts: {
    label: 'Webhook',
    labelPlural: 'Webhooks',
    doc: {
      summary:
        'Sends events to another system over HTTP: the URL, the signing secret, the event types it gets and whether it is active, with the outcome of the latest delivery.',
    },
  },
  basePath: '/webhooks',
  section: NAV_SECTIONS.notifications,
  order: 80,
  icon: NAV_ICONS.webhooks,
  displayField: 'url',
  data: { provider: 'hasura' },
  fields: webhookSubscriptionFields,
  views: {
    list: {
      columns: ['url', 'description', 'is_active', 'last_delivery_status', 'last_delivery_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: [{ field: 'url', op: 'contains' }, { field: 'description', op: 'contains' }] },
      filters: { pinned: ['is_active', 'last_delivery_status'], fields: ['is_active', 'last_delivery_status', 'last_delivery_at'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } },
        {
          id: 'failing',
          texts: 'Failing',
          state: { filters: [{ field: 'last_delivery_status', op: 'in', value: ['failed', 'retrying', 'dead_letter'] }] },
        },
      ],
    },
    show: {
      header: (l) => [l.grid(['is_active', 'last_delivery_status', 'last_delivery_at'])],
      body: (l) => {
        const bySubscription = [{ field: 'subscription_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          l.tabs(
            [
              l.panel(['url', 'description', l.grid(['created_at', 'updated_at'])], { key: 'details', texts: 'Details' }),
              l.panel(
                [
                  l.place(relatedList(resourceByName(WEBHOOK_SUBSCRIPTION_EVENT_TYPE_RESOURCE)), {
                    key: 'webhook-event-types',
                    // Also seeds "+ Create": a new event type belongs to this webhook.
                    props: { where: [...bySubscription], columns: ['event_type', 'created_at'], open: 'none' },
                  }),
                ],
                { key: 'event-types', texts: 'Event types' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(WEBHOOK_DELIVERY_RESOURCE)), {
                    key: 'webhook-deliveries',
                    props: { where: [...bySubscription], columns: [...SUBSCRIPTION_DELIVERY_COLUMNS], open: 'page' },
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
    create: { body: () => [...FORM] },
    edit: { body: () => [...FORM] },
  },
});

/**
 * The event types of a webhook subscription (one without any is sent nothing), added and removed
 * on the subscription's page. No page of its own; a row is never changed, only added or removed.
 */
export const webhookSubscriptionEventType = defineResource(WEBHOOK_SUBSCRIPTION_EVENT_TYPE_RESOURCE, {
  texts: {
    label: 'Webhook event type',
    labelPlural: 'Event types',
    doc: { summary: 'An event type a webhook subscription is sent; a subscription without any is sent nothing.' },
  },
  basePath: '/webhook-event-types',
  displayField: 'event_type',
  data: { provider: 'hasura' },
  operations: { edit: false },
  builtinActions: { edit: false },
  fields: webhookSubscriptionEventTypeFields,
  views: {
    list: { page: false, columns: ['event_type', 'created_at'], defaultSort: [{ field: 'event_type', direction: 'asc' }] },
    show: { page: false },
    create: { body: () => ['subscription_id', 'event_type'] },
  },
});
