import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_ON_CALL_STEP_RESOURCE,
  ESCALATION_POLICY_RESOURCE,
  ON_CALL_SCHEDULE_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { PERSON_CHANNELS, PERSON_CHANNEL_ENUM } from '../../enums/notifications';
import { rangeValidator } from '../../fields/bounded-number';

/*
 * The steps of an escalation policy (`itap.escalation_policy_steps`). A step pages exactly one of a
 * recipient group or the person on call in a schedule (`escalation_policy_steps_exactly_one_target`);
 * as for recipient group members (G45), the rows are two resources over the one table, each form
 * offering and requiring its own target. Steps run in the order of their numbers, across both kinds
 * (buro has no drag reordering, G51): renumber a step to move it; a number is used once per policy.
 */

/** Step numbers start at 1 (`escalation_policy_steps_step_no_positive`). */
const STEP_NO = { min: 1, integer: true } as const;
/** `escalation_policy_steps_after_minutes_nonnegative`. */
const AFTER_MINUTES = { min: 0, integer: true } as const;

const common = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  policy_id: f.relation({
    to: ESCALATION_POLICY_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: { label: 'Policy', doc: { summary: 'The escalation policy the step belongs to.' } },
  }),
  step_no: f.number({
    required: true,
    integer: true,
    min: STEP_NO.min,
    default: 1,
    validate: rangeValidator(STEP_NO),
    texts: {
      label: 'Step',
      doc: {
        summary:
          'The step’s place in the policy: steps run from the lowest number up, group and on-call steps together. Each number once per policy; gaps are fine (10, 20, 30 leaves room to insert a step later).',
      },
    },
  }),
  after_minutes: f.number({
    required: true,
    integer: true,
    min: AFTER_MINUTES.min,
    default: 0,
    validate: rangeValidator(AFTER_MINUTES),
    texts: {
      label: 'After (minutes)',
      doc: {
        summary:
          'How long the incident must stay unacknowledged before this step pages: counted from the incident for the first step, from the previous page for the others. 0 pages at once.',
      },
    },
  }),
  channel: enumField(PERSON_CHANNELS, PERSON_CHANNEL_ENUM, {
    required: true,
    default: 'in_app',
    texts: {
      label: 'Channel',
      doc: {
        summary:
          'How the step pages: people on this channel, and a group’s external addresses listed with this channel. Never a webhook.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: [] }),
};

/** Columns of a step that pages a recipient group. */
export const escalationGroupStepFields = {
  ...common,
  recipient_group_id: f.relation({
    to: RECIPIENT_GROUP_RESOURCE,
    required: true,
    open: 'page',
    texts: {
      label: 'Recipient group',
      doc: {
        summary:
          'Everyone in the group is paged: each person on the step’s channel, and the external addresses listed with that channel.',
      },
    },
  }),
};

/** Columns of a step that pages the person on call. */
export const escalationOnCallStepFields = {
  ...common,
  on_call_schedule_id: f.relation({
    to: ON_CALL_SCHEDULE_RESOURCE,
    required: true,
    open: 'page',
    texts: {
      label: 'On-call schedule',
      doc: {
        summary:
          'The person on call in the schedule when the step runs is paged (their delegate while they are on vacation). A schedule with nobody active pages no one.',
      },
    },
  }),
};

export const GROUP_STEP_COLUMNS = ['step_no', 'after_minutes', 'recipient_group_id', 'channel'] as const;
export const ON_CALL_STEP_COLUMNS = ['step_no', 'after_minutes', 'on_call_schedule_id', 'channel'] as const;

/** The steps of a policy that page a recipient group, on the policy's Steps tab; no page of their own. */
export const escalationGroupStep = defineResource(ESCALATION_GROUP_STEP_RESOURCE, {
  texts: {
    label: 'Group step',
    labelPlural: 'Steps paging a group',
    doc: { summary: 'An escalation step that pages everyone in a recipient group, a number of minutes after the step before it.' },
  },
  basePath: '/escalation-group-steps',
  displayField: 'step_no',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['policy_id'] },
  fields: escalationGroupStepFields,
  views: {
    list: { page: false, columns: [...GROUP_STEP_COLUMNS], defaultSort: [{ field: 'step_no', direction: 'asc' }] },
    show: { page: false },
    create: { body: (l) => ['policy_id', l.grid(['step_no', 'after_minutes']), l.grid(['recipient_group_id', 'channel'])] },
    edit: { body: (l) => ['policy_id', l.grid(['step_no', 'after_minutes']), l.grid(['recipient_group_id', 'channel'])] },
  },
});

/** The steps of a policy that page the person on call, on the policy's Steps tab; no page of their own. */
export const escalationOnCallStep = defineResource(ESCALATION_ON_CALL_STEP_RESOURCE, {
  texts: {
    label: 'On-call step',
    labelPlural: 'Steps paging the person on call',
    doc: { summary: 'An escalation step that pages whoever is on call in a schedule, a number of minutes after the step before it.' },
  },
  basePath: '/escalation-on-call-steps',
  displayField: 'step_no',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['policy_id'] },
  fields: escalationOnCallStepFields,
  views: {
    list: { page: false, columns: [...ON_CALL_STEP_COLUMNS], defaultSort: [{ field: 'step_no', direction: 'asc' }] },
    show: { page: false },
    create: { body: (l) => ['policy_id', l.grid(['step_no', 'after_minutes']), l.grid(['on_call_schedule_id', 'channel'])] },
    edit: { body: (l) => ['policy_id', l.grid(['step_no', 'after_minutes']), l.grid(['on_call_schedule_id', 'channel'])] },
  },
});
