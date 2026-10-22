import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
} from '../../data/resource-names';
import { EVENT_TYPE_ENUM } from '../../enums/events';
import { EVENT_TYPES } from '../../enums/event-types';
import { enumField } from '../../enums/field';
import { NOTIFICATION_CHANNEL_ENUM, PERSON_CHANNELS } from '../../enums/notifications';

const ruleField = f.relation({
  to: NOTIFICATION_RULE_RESOURCE,
  required: true,
  write: 'create',
  open: 'page',
  texts: { label: 'Rule', doc: { summary: 'The notification rule the row belongs to.' } },
});

/** Columns of `itap.notification_rule_event_types`: one event type a rule fires on. */
export const notificationRuleEventTypeFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  rule_id: ruleField,
  event_type: enumField(EVENT_TYPES, EVENT_TYPE_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Event type',
      doc: { summary: 'Events of this type are checked against the rule’s conditions; each type once per rule.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

/** Columns of `itap.notification_rule_channels`: one channel a rule notifies on. */
export const notificationRuleChannelFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  rule_id: ruleField,
  channel: enumField(PERSON_CHANNELS, NOTIFICATION_CHANNEL_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Channel',
      doc: {
        summary:
          'Members of the recipient group listed with this channel are notified on it; each channel once per rule. Webhooks are not a rule channel: they have subscriptions of their own.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

/**
 * The event types of a notification rule (a rule without any fires on none), added and removed on
 * the rule's page. No page of its own; a row is never changed, only added or removed.
 */
export const notificationRuleEventType = defineResource(NOTIFICATION_RULE_EVENT_TYPE_RESOURCE, {
  texts: {
    label: 'Rule event type',
    labelPlural: 'Event types',
    doc: { summary: 'An event type a notification rule fires on; a rule without any notifies about nothing.' },
  },
  basePath: '/notification-rule-event-types',
  displayField: 'event_type',
  data: { provider: 'hasura' },
  operations: { edit: false },
  builtinActions: { edit: false },
  fields: notificationRuleEventTypeFields,
  views: {
    list: { page: false, columns: ['event_type', 'created_at'], defaultSort: [{ field: 'event_type', direction: 'asc' }] },
    show: { page: false },
    create: { body: () => ['rule_id', 'event_type'] },
  },
});

/**
 * The channels of a notification rule, added and removed on the rule's page: a recipient is
 * notified on each channel both the rule and their group membership name. Never `webhook` (CHECK
 * `notification_rule_channels_channel_not_webhook`): the channel list does not offer it.
 */
export const notificationRuleChannel = defineResource(NOTIFICATION_RULE_CHANNEL_RESOURCE, {
  texts: {
    label: 'Rule channel',
    labelPlural: 'Channels',
    doc: {
      summary:
        'A channel a notification rule notifies on (in-app, email, SMS, push); a rule without any notifies nobody.',
    },
  },
  basePath: '/notification-rule-channels',
  displayField: 'channel',
  data: { provider: 'hasura' },
  operations: { edit: false },
  builtinActions: { edit: false },
  fields: notificationRuleChannelFields,
  views: {
    list: { page: false, columns: ['channel', 'created_at'], defaultSort: [{ field: 'channel', direction: 'asc' }] },
    show: { page: false },
    create: { body: () => ['rule_id', 'channel'] },
  },
});
