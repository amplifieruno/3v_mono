import { type Layout, defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_ON_CALL_STEP_RESOURCE,
  ESCALATION_POLICY_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
} from '../../data/resource-names';
import { rangeValidator } from '../../fields/bounded-number';
import { checkNotBlank } from '../../fields/not-blank';
import { GROUP_STEP_COLUMNS, ON_CALL_STEP_COLUMNS } from './escalation-steps';
import { NOTIFICATION_RULE_COLUMNS } from './notification-rule';

/** `escalation_policies_max_cycles_positive`: at least one pass. */
const MAX_CYCLES = { min: 1, integer: true } as const;

/** Columns of `itap.escalation_policies` the `org_admin` role reads; all but the stamps are written by a person. */
export const escalationPolicyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The policy’s name, unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  repeat: f.boolean({
    default: false,
    texts: {
      label: 'Repeat',
      doc: {
        summary:
          'After the last step, start again from the first while the incident is still unacknowledged. Off: the policy stops after one pass.',
      },
    },
  }),
  max_cycles: f.number({
    nullable: true,
    integer: true,
    min: MAX_CYCLES.min,
    validate: rangeValidator(MAX_CYCLES),
    texts: {
      label: 'Passes at most',
      doc: {
        summary:
          'For a repeating policy: how many passes through the steps in all, the first included (3 = the first pass and two repeats). Empty: repeat until someone acknowledges. Switching Repeat off clears it.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

type Fields = typeof escalationPolicyFields;

/**
 * The repeat settings: the number of passes only while the policy repeats (read from `values` or
 * `record`). The form writes only the fields it shows, so switching Repeat off sends no
 * `max_cycles`; the database clears it then (trigger `escalation_policies_clear_max_cycles`).
 */
const repeatGrid = (l: Layout<Fields>, source: 'values' | 'record') =>
  l.grid(['repeat', l.field('max_cycles', { when: l.equals(l.ref(source, 'repeat'), true) })]);

/**
 * Escalation policies (`itap.escalation_policies`): who is paged, step by step, while an incident
 * stays unacknowledged (cron `escalate`, `itap.next_escalation_step`). Steps page a recipient group
 * or the person on call; they run in the order of their numbers, each after its minutes, and the
 * whole sequence repeats when the policy says so. Given to incidents by event rule versions and
 * notification rules, or chosen on the incident.
 */
export const escalationPolicy = defineResource(ESCALATION_POLICY_RESOURCE, {
  texts: {
    label: 'Escalation policy',
    labelPlural: 'Escalation policies',
    doc: {
      summary:
        'Who is paged, step by step, while an incident stays unacknowledged: given to incidents by event rule versions and notification rules.',
    },
  },
  basePath: '/escalation-policies',
  section: NAV_SECTIONS.notifications,
  order: 40,
  icon: NAV_ICONS.escalationPolicies,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: escalationPolicyFields,
  views: {
    list: {
      columns: ['name', 'repeat', 'max_cycles'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
    },
    show: {
      header: (l) => [repeatGrid(l, 'record')],
      body: (l) => {
        const byPolicy = [{ field: 'policy_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          'name',
          'description',
          l.tabs(
            [
              l.panel(
                [
                  l.place(relatedList(resourceByName(ESCALATION_GROUP_STEP_RESOURCE)), {
                    key: 'policy-group-steps',
                    // Also seeds "+ Create": a new step belongs to this policy.
                    props: {
                      where: [...byPolicy, { field: 'recipient_group_id', op: 'nnull', value: true }],
                      columns: [...GROUP_STEP_COLUMNS],
                      open: 'none',
                    },
                  }),
                  l.place(relatedList(resourceByName(ESCALATION_ON_CALL_STEP_RESOURCE)), {
                    key: 'policy-on-call-steps',
                    props: {
                      where: [...byPolicy, { field: 'on_call_schedule_id', op: 'nnull', value: true }],
                      columns: [...ON_CALL_STEP_COLUMNS],
                      open: 'none',
                    },
                  }),
                ],
                { key: 'steps', texts: 'Steps' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_RULE_RESOURCE)), {
                    key: 'policy-rules',
                    props: {
                      where: [{ field: 'escalation_policy_id', op: 'eq', value: l.ref('record', 'id') }],
                      columns: [...NOTIFICATION_RULE_COLUMNS],
                      open: 'page',
                    },
                  }),
                ],
                { key: 'rules', texts: 'Notification rules giving it' },
              ),
            ],
            { key: 'sections' },
          ),
          l.grid(['created_at', 'updated_at']),
        ];
      },
    },
    create: { body: (l) => ['name', 'description', repeatGrid(l, 'values')] },
    edit: { body: (l) => ['name', 'description', repeatGrid(l, 'values')] },
  },
});
