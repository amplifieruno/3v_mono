import { deliveryReportBlock } from '../../blocks/delivery-report/delivery-report-block';
import {
  DELIVERY_REPORT_OPERATIONS,
  deliveryReport,
  deliveryReportFacts,
} from '../../blocks/delivery-report/delivery-report-query';
import { notificationRuleTestBlock } from '../../blocks/notification-rule-test/notification-rule-test-block';
import {
  notificationUserNames,
  testNotificationRule,
  testNotificationRuleOperation,
  userNamesOperation,
} from '../../blocks/notification-rule-test/notification-rule-test-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_ON_CALL_STEP_RESOURCE,
  ESCALATION_POLICY_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  NOTIFICATION_SUBSCRIPTION_RESOURCE,
  NOTIFICATION_TEMPLATE_RESOURCE,
  ON_CALL_SCHEDULE_MEMBER_RESOURCE,
  ON_CALL_SCHEDULE_RESOURCE,
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
} from '../../data/resource-names';
import {
  conditionReferencesOperation,
  notificationConditionReferences,
} from '../../fields/notification-conditions-query';
import type { ConsoleModule } from '../module';
import { deliveryReportPage } from './delivery-report-page';
import { escalationPolicy, escalationPolicyFields } from './escalation-policy';
import {
  escalationGroupStep,
  escalationGroupStepFields,
  escalationOnCallStep,
  escalationOnCallStepFields,
} from './escalation-steps';
import { notificationDelivery, notificationDeliveryFields } from './notification-delivery';
import { notificationRule } from './notification-rule';
import { notificationRuleFields } from './notification-rule-fields';
import {
  notificationRuleChannel,
  notificationRuleChannelFields,
  notificationRuleEventType,
  notificationRuleEventTypeFields,
} from './notification-rule-links';
import { notificationSubscription, notificationSubscriptionFields } from './notification-subscription';
import { notificationTemplate } from './notification-template';
import { notificationTemplateFields } from './notification-template-fields';
import { onCallScheduleMember, onCallScheduleMemberFields } from './on-call-members';
import { onCallSchedule, onCallScheduleFields } from './on-call-schedule';
import { recipientGroup, recipientGroupFields } from './recipient-group';
import {
  recipientGroupAddressMember,
  recipientGroupAddressMemberFields,
  recipientGroupUserMember,
  recipientGroupUserMemberFields,
} from './recipient-group-members';

/**
 * Notifications: who is told what, how and when. Notification rules (event types, conditions,
 * channels, recipients, template, priority, digests) with their dry-run test, notification
 * templates, recipient groups (people and external addresses), escalation policies (group and
 * on-call steps) and on-call schedules (rotation, who is on call now); each member's own
 * subscriptions, the delivery log (read only) and the delivery report per channel and period.
 */
export const notificationsModule = {
  name: 'notifications-module',
  uses: [
    notificationRule,
    notificationRuleEventType,
    notificationRuleChannel,
    notificationTemplate,
    recipientGroup,
    recipientGroupUserMember,
    recipientGroupAddressMember,
    escalationPolicy,
    escalationGroupStep,
    escalationOnCallStep,
    onCallSchedule,
    onCallScheduleMember,
    notificationConditionReferences,
    testNotificationRule,
    notificationUserNames,
    notificationRuleTestBlock,
    notificationSubscription,
    notificationDelivery,
    deliveryReport,
    deliveryReportFacts,
    deliveryReportBlock,
    deliveryReportPage,
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
    [RECIPIENT_GROUP_USER_MEMBER_RESOURCE]: hasuraTable('recipient_group_members', {
      selectFields: selectFieldsOf(recipientGroupUserMemberFields),
    }),
    [RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE]: hasuraTable('recipient_group_members', {
      selectFields: selectFieldsOf(recipientGroupAddressMemberFields),
    }),
    [ESCALATION_POLICY_RESOURCE]: hasuraTable('escalation_policies', { selectFields: selectFieldsOf(escalationPolicyFields) }),
    [ESCALATION_GROUP_STEP_RESOURCE]: hasuraTable('escalation_policy_steps', {
      selectFields: selectFieldsOf(escalationGroupStepFields),
    }),
    [ESCALATION_ON_CALL_STEP_RESOURCE]: hasuraTable('escalation_policy_steps', {
      selectFields: selectFieldsOf(escalationOnCallStepFields),
    }),
    [ON_CALL_SCHEDULE_RESOURCE]: hasuraTable('on_call_schedules', { selectFields: selectFieldsOf(onCallScheduleFields) }),
    [ON_CALL_SCHEDULE_MEMBER_RESOURCE]: hasuraTable('on_call_schedule_members', {
      selectFields: selectFieldsOf(onCallScheduleMemberFields),
    }),
    [NOTIFICATION_SUBSCRIPTION_RESOURCE]: hasuraTable('notification_subscriptions', {
      selectFields: selectFieldsOf(notificationSubscriptionFields),
    }),
    [NOTIFICATION_DELIVERY_RESOURCE]: hasuraTable('notification_deliveries', {
      selectFields: selectFieldsOf(notificationDeliveryFields),
      orderByField: 'created_at',
      noAggregate: true,
    }),
  },
  operations: [conditionReferencesOperation, testNotificationRuleOperation, userNamesOperation, ...DELIVERY_REPORT_OPERATIONS],
} as const satisfies ConsoleModule;
