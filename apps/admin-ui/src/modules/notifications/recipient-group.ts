import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
} from '../../data/resource-names';
import { checkNotBlank } from '../../fields/not-blank';
import { GROUP_STEP_COLUMNS } from './escalation-steps';
import { NOTIFICATION_RULE_COLUMNS } from './notification-rule';
import { ADDRESS_MEMBER_COLUMNS, USER_MEMBER_COLUMNS } from './recipient-group-members';

/** Columns of `itap.recipient_groups` the `org_admin` role reads; name and description are written by a person. */
export const recipientGroupFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The group’s name, unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Recipient groups (`itap.recipient_groups`): the audience of notification rules and of the
 * group steps of escalation policies. Members are people (each with a channel) and external
 * addresses (email or SMS), on tabs of their own. A group an escalation step or a report schedule
 * pages cannot be deleted until that step is changed (`escalation_policy_steps_group_fkey`).
 */
export const recipientGroup = defineResource(RECIPIENT_GROUP_RESOURCE, {
  texts: {
    label: 'Recipient group',
    labelPlural: 'Recipient groups',
    doc: { summary: 'People and external addresses notified together, each on a channel: the audience of notification rules.' },
  },
  basePath: '/recipient-groups',
  section: NAV_SECTIONS.notifications,
  order: 30,
  icon: NAV_ICONS.recipientGroups,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: recipientGroupFields,
  views: {
    list: {
      columns: ['name', 'description'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
    },
    show: {
      body: (l) => {
        const byGroup = [{ field: 'group_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          'name',
          'description',
          l.tabs(
            [
              l.panel(
                [
                  l.place(relatedList(resourceByName(RECIPIENT_GROUP_USER_MEMBER_RESOURCE)), {
                    key: 'group-people',
                    // Also seeds "+ Create": a new member belongs to this group.
                    props: { where: [...byGroup, { field: 'user_id', op: 'nnull', value: true }], columns: [...USER_MEMBER_COLUMNS], open: 'none' },
                  }),
                ],
                { key: 'people', texts: 'People' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE)), {
                    key: 'group-addresses',
                    props: {
                      where: [...byGroup, { field: 'external_address', op: 'nnull', value: true }],
                      columns: [...ADDRESS_MEMBER_COLUMNS],
                      open: 'none',
                    },
                  }),
                ],
                { key: 'addresses', texts: 'External addresses' },
              ),
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
              l.panel(
                [
                  l.place(relatedList(resourceByName(ESCALATION_GROUP_STEP_RESOURCE)), {
                    key: 'group-steps',
                    props: {
                      where: [{ field: 'recipient_group_id', op: 'eq', value: l.ref('record', 'id') }],
                      columns: ['policy_id', ...GROUP_STEP_COLUMNS],
                      open: 'none',
                    },
                  }),
                ],
                { key: 'steps', texts: 'Escalation steps paging it' },
              ),
            ],
            { key: 'sections' },
          ),
          l.grid(['created_at', 'updated_at']),
        ];
      },
    },
    create: { body: () => ['name', 'description'] },
    edit: { body: () => ['name', 'description'] },
  },
});
