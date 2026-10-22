import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { resourceByName } from '../../data/resource-by-name';
import { ESCALATION_POLICY_RESOURCE, NOTIFICATION_RULE_RESOURCE, RECIPIENT_GROUP_RESOURCE } from '../../data/resource-names';
import { NOTIFICATION_RULE_COLUMNS } from './notification-rule';

/*
 * Minimal read-only recipient groups and escalation policies, so the relations of rules,
 * incidents and rule versions show names and open a page. Their members, steps and editing come
 * with the recipient-group and escalation pages (plan 06 Task 2), which extend these resources.
 */

/** Columns of `itap.recipient_groups` the `org_admin` role reads. */
export const recipientGroupFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({ system: true, texts: { label: 'Name', doc: { summary: 'The group’s name, unique in the organization.' } } }),
  description: f.text({ system: true, nullable: true, in: ['show'], texts: 'Description' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** Columns of `itap.escalation_policies` the `org_admin` role reads. */
export const escalationPolicyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({ system: true, texts: { label: 'Name', doc: { summary: 'The policy’s name, unique in the organization.' } } }),
  description: f.text({ system: true, nullable: true, in: ['show'], texts: 'Description' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

const READ_ONLY = {
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
} as const;

/** Recipient groups (`itap.recipient_groups`): who a rule notifies, each member on their channel. */
export const recipientGroup = defineResource(RECIPIENT_GROUP_RESOURCE, {
  texts: {
    label: 'Recipient group',
    labelPlural: 'Recipient groups',
    doc: { summary: 'People and external addresses notified together, each on a channel: the audience of notification rules.' },
  },
  basePath: '/recipient-groups',
  displayField: 'name',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: recipientGroupFields,
  views: {
    list: { page: false, columns: ['name'], defaultSort: [{ field: 'name', direction: 'asc' }] },
    show: {
      body: (l) => [
        'name',
        'description',
        l.grid(['created_at', 'updated_at']),
        l.panel(
          [
            l.place(relatedList(resourceByName(NOTIFICATION_RULE_RESOURCE)), {
              key: 'group-rules',
              props: {
                where: [{ field: 'recipient_group_id', op: 'eq', value: l.ref('record', 'id') }],
                columns: [...NOTIFICATION_RULE_COLUMNS],
                open: 'page',
              },
            }),
          ],
          { key: 'rules', texts: 'Rules notifying it' },
        ),
      ],
    },
  },
});

/** Escalation policies (`itap.escalation_policies`): who is paged, step by step, while an incident stays unacknowledged. */
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
  displayField: 'name',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: escalationPolicyFields,
  views: {
    list: { page: false, columns: ['name'], defaultSort: [{ field: 'name', direction: 'asc' }] },
    show: {
      body: (l) => [
        'name',
        'description',
        l.grid(['created_at', 'updated_at']),
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
    },
  },
});
