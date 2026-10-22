import { f } from '@burojs/field-types';
import {
  ESCALATION_POLICY_RESOURCE,
  NOTIFICATION_TEMPLATE_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
} from '../../data/resource-names';
import {
  NOTIFICATION_DIGEST_MODES,
  NOTIFICATION_DIGEST_MODE_ENUM,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_PRIORITY_ENUM,
} from '../../enums/notifications';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { notificationConditions } from '../../fields/notification-conditions';

/**
 * Columns of `itap.notification_rules` the `org_admin` role reads. Everything but the code and
 * the stamps is written by a person; `last_triggered_at` is written by the fan-out (Stage C).
 * Event types and channels are rows of their own (`./notification-rule-links.ts`).
 */
export const notificationRuleFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show', 'edit'],
    texts: { label: 'Code', doc: { summary: 'The rule’s number in the organization (NRULE-00004), given on creation.' } },
  }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'What the rule is about; unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  conditions: notificationConditions({
    texts: {
      label: 'Conditions',
      doc: {
        summary:
          'Which events of the rule’s event types it notifies about: in a facility, in an area (and the areas inside it), about a member of a segment, at least this severe. Every condition set must hold; none set means every event of those types.',
      },
    },
  }),
  priority: enumField(NOTIFICATION_PRIORITIES, NOTIFICATION_PRIORITY_ENUM, {
    required: true,
    default: 'medium',
    texts: {
      label: 'Priority',
      doc: {
        summary:
          'How urgent the notifications are. Critical ones are delivered at once, even during a recipient’s quiet hours; the others wait until the quiet hours end.',
      },
    },
  }),
  recipient_group_id: f.relation({
    to: RECIPIENT_GROUP_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'recipient_group' },
    texts: {
      label: 'Recipients',
      doc: {
        summary:
          'The recipient group told about each match, every member on the rule’s channels they are listed with (a member on vacation through their delegate). A rule without a group notifies nobody, but still lends its escalation policy to incidents.',
      },
    },
  }),
  template_id: f.relation({
    to: NOTIFICATION_TEMPLATE_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'template' },
    texts: {
      label: 'Template',
      doc: {
        summary:
          'The wording of the notifications. The template’s name is what counts: each channel uses the template of that name for its channel, in the recipient’s language when there is one. Without a template a plain line is sent (severity, title, place, time).',
      },
    },
  }),
  escalation_policy_id: f.relation({
    to: ESCALATION_POLICY_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'escalation_policy' },
    texts: {
      label: 'Escalation policy',
      doc: {
        summary:
          'Given to an incident the matched event opened, when it has none yet: who is paged, step by step, while nobody acknowledges the incident.',
      },
    },
  }),
  is_active: f.boolean({
    default: true,
    texts: {
      label: 'Active',
      doc: { summary: 'An inactive rule notifies nobody; it can still be tested. Switch a rule off instead of deleting it to keep its history.' },
    },
  }),
  digest_mode: enumField(NOTIFICATION_DIGEST_MODES, NOTIFICATION_DIGEST_MODE_ENUM, {
    required: true,
    default: 'none',
    texts: {
      label: 'Delivery',
      doc: {
        summary:
          'Immediately, one notification per match, or gathered into an hourly or daily digest per recipient and channel. The in-app inbox always gets each match at once.',
      },
    },
  }),
  last_triggered_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Last triggered', doc: { summary: 'When the latest event the rule matched happened (an active rule only).' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
