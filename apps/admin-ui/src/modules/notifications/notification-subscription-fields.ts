import type { Check } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  FACILITY_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  USER_RESOURCE,
  WATCH_LIST_RESOURCE,
} from '../../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, EVENT_TYPE_ENUM } from '../../enums/events';
import { EVENT_TYPES } from '../../enums/event-types';
import { enumField } from '../../enums/field';
import { PERSON_CHANNELS, PERSON_CHANNEL_ENUM } from '../../enums/notifications';

/*
 * Columns of `itap.notification_subscriptions`: a member's own standing order to be told about
 * events. Every filter that is set must match (event type, facility, person, identity, watch list),
 * the event must be at least as severe as `min_severity`, and at least one filter is set
 * (`notification_subscriptions_needs_filter`). The database keeps the rows private: a member reads,
 * creates and changes only their own (`user_id` is set from the session).
 */

/** The filters of a subscription, at least one of which is set (`notification_subscriptions_needs_filter`). */
export const SUBSCRIPTION_FILTERS = ['event_type', 'facility_id', 'profile_id', 'identity_id', 'watch_list_id'] as const;

export const notificationSubscriptionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  event_type: enumField(EVENT_TYPES, EVENT_TYPE_ENUM, {
    nullable: true,
    texts: {
      label: 'Event type',
      doc: { summary: 'Only events of this type; empty for every type the other filters let through.' },
    },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'facility' },
    texts: { label: 'Facility', doc: { summary: 'Only events in this facility; empty for every facility.' } },
  }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'profile' },
    texts: {
      label: 'Person',
      doc: { summary: 'Only events about this known person (any of their identities); empty for anyone.' },
    },
  }),
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'identity' },
    texts: {
      label: 'Identity',
      doc: { summary: 'Only events about this one tracked face, for someone without a profile; empty for any.' },
    },
  }),
  watch_list_id: f.relation({
    to: WATCH_LIST_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'watch_list' },
    texts: {
      label: 'Watch list',
      doc: { summary: 'Only watch-list matches of this list (blacklist, VIP or watch matches); empty for any event.' },
    },
  }),
  channel: enumField(PERSON_CHANNELS, PERSON_CHANNEL_ENUM, {
    required: true,
    default: 'in_app',
    texts: {
      label: 'Channel',
      doc: {
        summary:
          'How you are told: in your inbox (in-app), by email, SMS or push, at the address of your account. Never a webhook: other systems use webhook subscriptions.',
      },
    },
  }),
  min_severity: enumField(EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, {
    required: true,
    default: 'info',
    texts: {
      label: 'At least',
      doc: { summary: 'The least severe event you are told about: Info for every event, High for high and critical ones only.' },
    },
  }),
  is_active: f.boolean({
    required: true,
    default: true,
    texts: {
      label: 'Active',
      doc: {
        summary:
          'Switch it off to unsubscribe: nothing more is sent, and the deliveries already sent stay in the log. Switch it on again to resubscribe.',
      },
    },
  }),
  user_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: [],
    open: 'none',
    texts: { label: 'Subscriber', doc: { summary: 'You: a subscription belongs to the member who made it.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** Whether no filter is set: the subscription would match every event, which the database refuses. */
export function hasNoFilter(values: Readonly<Record<string, unknown>>): boolean {
  return SUBSCRIPTION_FILTERS.every((name) => {
    const value = values[name];
    return value === null || value === undefined || value === '';
  });
}

/** A subscription narrows the events somehow (`notification_subscriptions_needs_filter`). */
export const SUBSCRIPTION_CHECKS: Check[] = [
  {
    id: 'subscriptionNeedsFilter',
    on: ['create', 'edit'],
    severity: 'error',
    trigger: 'submit',
    texts: 'Choose at least one of event type, facility, person, identity or watch list: a subscription to every event is not allowed.',
    when: ({ values }) => hasNoFilter(values),
  },
];
