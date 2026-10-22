import { notificationRuleTestBlock } from '../../blocks/notification-rule-test/notification-rule-test-block';
import {
  notificationUserNames,
  testNotificationRule,
  testNotificationRuleOperation,
  userNamesOperation,
} from '../../blocks/notification-rule-test/notification-rule-test-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  ESCALATION_POLICY_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  NOTIFICATION_TEMPLATE_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
} from '../../data/resource-names';
import {
  conditionReferencesOperation,
  notificationConditionReferences,
} from '../../fields/notification-conditions-query';
import type { ConsoleModule } from '../module';
import { escalationPolicy, escalationPolicyFields, recipientGroup, recipientGroupFields } from './notification-audiences';
import { notificationRule } from './notification-rule';
import { notificationRuleFields } from './notification-rule-fields';
import {
  notificationRuleChannel,
  notificationRuleChannelFields,
  notificationRuleEventType,
  notificationRuleEventTypeFields,
} from './notification-rule-links';
import { notificationTemplate } from './notification-template';
import { notificationTemplateFields } from './notification-template-fields';

/**
 * Notifications: who is told what, how and when. Notification rules (event types, conditions,
 * channels, recipients, template, priority, digests) with their dry-run test, notification
 * templates, and read-only recipient groups and escalation policies for the relations (their
 * editing pages come later in the phase).
 */
export const notificationsModule = {
  name: 'notifications-module',
  uses: [
    notificationRule,
    notificationRuleEventType,
    notificationRuleChannel,
    notificationTemplate,
    recipientGroup,
    escalationPolicy,
    notificationConditionReferences,
    testNotificationRule,
    notificationUserNames,
    notificationRuleTestBlock,
  ],
  tables: {
    [NOTIFICATION_RULE_RESOURCE]: hasuraTable('notification_rules', { selectFields: selectFieldsOf(notificationRuleFields) }),
    [NOTIFICATION_RULE_EVENT_TYPE_RESOURCE]: hasuraTable('notification_rule_event_types', {
      selectFields: selectFieldsOf(notificationRuleEventTypeFields),
    }),
    [NOTIFICATION_RULE_CHANNEL_RESOURCE]: hasuraTable('notification_rule_channels', {
      selectFields: selectFieldsOf(notificationRuleChannelFields),
    }),
    [NOTIFICATION_TEMPLATE_RESOURCE]: hasuraTable('notification_templates', {
      selectFields: selectFieldsOf(notificationTemplateFields),
    }),
    [RECIPIENT_GROUP_RESOURCE]: hasuraTable('recipient_groups', { selectFields: selectFieldsOf(recipientGroupFields) }),
    [ESCALATION_POLICY_RESOURCE]: hasuraTable('escalation_policies', { selectFields: selectFieldsOf(escalationPolicyFields) }),
  },
  operations: [conditionReferencesOperation, testNotificationRuleOperation, userNamesOperation],
} as const satisfies ConsoleModule;
