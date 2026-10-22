import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * "Test rule" (`itap:notification-rule-test`): a notification rule tried against the
 * organization's latest events with `test_notification_rule`, which reads only (nothing is sent
 * or written). Says how many events would match and who would be told, then lists each event with
 * the outcome (would notify, another event type, conditions not met) and, for a match, every
 * recipient with the channel. Prop `ruleId` (the rule's "Test rule" action passes its record).
 */
export const notificationRuleTestBlock = defineBlock('itap:notification-rule-test', {
  texts: {
    label: 'Test rule',
    intro:
      'The rule tried against the organization’s latest events, as if it were active. Nothing is sent and nothing is written.',
    events: 'Latest events to try',
    run: 'Test again',
    running: 'Testing…',
    failed: 'The test could not be run.',
    gone: 'The rule no longer exists.',
    none: 'The organization has no events yet: there is nothing to test against.',
    summary: '{{matched}} of the latest {{events}} events would match: {{notifications}} notifications to {{recipients}} recipients.',
    noMatch: 'None of the latest {{events}} events would match.',
    noRecipients:
      'A match notifies nobody: the rule has no recipient group, no channel, or no group member listed with one of its channels.',
    when: 'When',
    event: 'Event',
    severity: 'Severity',
    outcome: 'Outcome',
    recipients: 'Recipients',
    reason_match: 'Would notify',
    reason_event_type_mismatch: 'Other event type',
    reason_condition_mismatch: 'Conditions not met',
    nobody: 'Nobody',
    member: 'Member {{id}}',
    on: '{{who}} · {{channel}}',
    tested: 'Tested {{time}}.',
  },
  props: {
    ruleId: prop(z.string().nullable().optional()).default(null),
  },
});
