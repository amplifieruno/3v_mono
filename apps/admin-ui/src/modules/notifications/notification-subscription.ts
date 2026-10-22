import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { NOTIFICATION_DELIVERY_RESOURCE, NOTIFICATION_SUBSCRIPTION_RESOURCE } from '../../data/resource-names';
import { SUBSCRIPTION_CHECKS, notificationSubscriptionFields } from './notification-subscription-fields';

export { notificationSubscriptionFields };

/** The columns of a subscription's Deliveries tab. */
const SUBSCRIPTION_DELIVERY_COLUMNS = ['created_at', 'title', 'status', 'channel', 'attempts'] as const;

/** The rows of the create and edit forms: what to follow, then how to be told. */
const FORM_ROWS = [
  ['event_type', 'min_severity'],
  ['facility_id', 'watch_list_id'],
  ['profile_id', 'identity_id'],
  ['channel', 'is_active'],
] as const;

/**
 * "My subscriptions" (`itap.notification_subscriptions`): self-service, each member sees and
 * changes only their own (the database filters by the session user). A subscription tells its
 * member about the events its filters let through, on one channel. Unsubscribing switches it off
 * (`is_active`) rather than deleting it: a delete would also remove its deliveries from the log
 * (`notification_deliveries_subscription_fkey` cascades), so the console offers no delete. A
 * subscription with a facility shows under that facility, one without under every facility.
 */
export const notificationSubscription = defineResource(NOTIFICATION_SUBSCRIPTION_RESOURCE, {
  texts: {
    label: 'Subscription',
    labelPlural: 'My subscriptions',
    doc: {
      summary:
        'Your own standing order to be told about events: the event type, facility, person, identity or watch list it follows, the least severity and the channel. Only you see your subscriptions.',
    },
  },
  basePath: '/my-subscriptions',
  section: NAV_SECTIONS.notifications,
  order: 60,
  icon: NAV_ICONS.subscriptions,
  displayField: 'event_type',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  operations: { delete: false },
  builtinActions: { delete: false },
  fields: notificationSubscriptionFields,
  checks: SUBSCRIPTION_CHECKS,
  views: {
    list: {
      columns: ['event_type', 'facility_id', 'profile_id', 'identity_id', 'watch_list_id', 'min_severity', 'channel', 'is_active'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { pinned: ['is_active', 'channel'], fields: ['is_active', 'channel', 'event_type', 'min_severity', 'facility_id', 'watch_list_id'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } },
        { id: 'inactive', texts: 'Switched off', state: { filters: [{ field: 'is_active', op: 'eq', value: false }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['event_type', 'min_severity', 'channel', 'is_active'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [l.grid(['facility_id', 'watch_list_id']), l.grid(['profile_id', 'identity_id']), l.grid(['created_at', 'updated_at'])],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(NOTIFICATION_DELIVERY_RESOURCE)), {
                  key: 'subscription-deliveries',
                  props: {
                    where: [{ field: 'subscription_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...SUBSCRIPTION_DELIVERY_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'deliveries', texts: 'Deliveries' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: (l) => FORM_ROWS.map((row) => l.grid([...row])) },
    edit: { body: (l) => FORM_ROWS.map((row) => l.grid([...row])) },
  },
});
