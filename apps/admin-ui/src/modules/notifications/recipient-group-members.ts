import { type Check, defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { ADDRESS_CHANNELS, ADDRESS_CHANNEL_ENUM, PERSON_CHANNELS, PERSON_CHANNEL_ENUM } from '../../enums/notifications';
import { checkNotBlank } from '../../fields/not-blank';

/*
 * The members of a recipient group (`itap.recipient_group_members`). A member is exactly one of an
 * organization member or an external address (`recipient_group_members_exactly_one_recipient`),
 * and buro's record types cannot discriminate on which of two columns is set (G45), so the rows are
 * two resources over the one table, as watch-list entries are: people (`user_id` set) and external
 * addresses (`external_address` set). Each form offers its own recipient only and requires it, so a
 * member with neither (or both) cannot be saved.
 */

const groupField = f.relation({
  to: RECIPIENT_GROUP_RESOURCE,
  required: true,
  write: 'create',
  open: 'page',
  texts: { label: 'Group', doc: { summary: 'The recipient group the member belongs to.' } },
});

const id = f.uuid({ system: true, texts: 'ID', in: [] });
const created = f.dateTime({ system: true, texts: 'Added', in: ['list'] });

export { ADDRESS_CHANNELS };

/** Columns of `itap.recipient_group_members` for a member who is a person of the organization. */
export const recipientGroupUserMemberFields = {
  id,
  group_id: groupField,
  user_id: f.relation({
    to: USER_RESOURCE,
    required: true,
    open: 'none',
    texts: {
      label: 'Member',
      doc: {
        summary:
          'A person of the organization, active when added. A member deactivated later keeps the row but receives nothing; one on vacation is reached through their delegate.',
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
          'The channel the person is listed with: a rule tells them on each of its channels they are listed with (list a person once per channel). An escalation step pages every person of the group on the step’s channel, whatever this says.',
      },
    },
  }),
  created_at: created,
};

/** Columns of `itap.recipient_group_members` for a member who is an external address. */
export const recipientGroupAddressMemberFields = {
  id,
  group_id: groupField,
  external_address: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Address',
      doc: {
        summary:
          'An email address (channel Email) or a phone number in international format such as +441632960123 (channel SMS), for someone without a console account.',
      },
    },
  }),
  channel: enumField(ADDRESS_CHANNELS, ADDRESS_CHANNEL_ENUM, {
    required: true,
    default: 'email',
    texts: {
      label: 'Channel',
      doc: {
        summary:
          'How the address is reached: Email or SMS, matching the address. It is told only on rules and escalation steps of that channel.',
      },
    },
  }),
  created_at: created,
};

const EMAIL_ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const PHONE_NUMBER = /^\+[1-9][0-9]{6,14}$/u;

/**
 * Which format `address` misses for `channel` (`recipient_group_members_address_format`): an email
 * address for email, an E.164 phone number for SMS. `null` when it fits, or when there is nothing
 * to check yet (the required rule speaks then).
 */
export function addressProblem(address: unknown, channel: unknown): 'email' | 'phone' | null {
  if (typeof address !== 'string' || address.trim() === '') return null;
  if (channel === 'email') return EMAIL_ADDRESS.test(address) ? null : 'email';
  if (channel === 'sms') return PHONE_NUMBER.test(address) ? null : 'phone';
  return null;
}

/** The address must fit its channel, as the database checks it. */
export const ADDRESS_MEMBER_CHECKS: Check[] = [
  {
    id: 'addressEmail',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'external_address',
    texts: 'Enter an email address, such as alerts@example.com.',
    when: ({ values }) => addressProblem(values.external_address, values.channel) === 'email',
  },
  {
    id: 'addressPhone',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'external_address',
    texts: 'Enter the phone number in international format: + and the country code, such as +441632960123.',
    when: ({ values }) => addressProblem(values.external_address, values.channel) === 'phone',
  },
];

export const USER_MEMBER_COLUMNS = ['user_id', 'channel', 'created_at'] as const;
export const ADDRESS_MEMBER_COLUMNS = ['external_address', 'channel', 'created_at'] as const;

/** The people of a recipient group, on the group's People tab; no page of their own. */
export const recipientGroupUserMember = defineResource(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, {
  texts: {
    label: 'Group member',
    labelPlural: 'People',
    doc: { summary: 'A person of the organization in a recipient group, with the channel they are told on.' },
  },
  basePath: '/recipient-group-people',
  displayField: 'user_id',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['group_id'] },
  fields: recipientGroupUserMemberFields,
  views: {
    list: { page: false, columns: [...USER_MEMBER_COLUMNS], defaultSort: [{ field: 'created_at', direction: 'asc' }] },
    show: { page: false },
    create: { body: (l) => ['group_id', l.grid(['user_id', 'channel'])] },
    edit: { body: (l) => ['group_id', l.grid(['user_id', 'channel'])] },
  },
});

/** The external addresses of a recipient group, on the group's External addresses tab; no page of their own. */
export const recipientGroupAddressMember = defineResource(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, {
  texts: {
    label: 'External address',
    labelPlural: 'External addresses',
    doc: { summary: 'An email address or phone number in a recipient group, for someone without a console account.' },
  },
  basePath: '/recipient-group-addresses',
  displayField: 'external_address',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['group_id'] },
  fields: recipientGroupAddressMemberFields,
  checks: ADDRESS_MEMBER_CHECKS,
  views: {
    list: { page: false, columns: [...ADDRESS_MEMBER_COLUMNS], defaultSort: [{ field: 'created_at', direction: 'asc' }] },
    show: { page: false },
    create: { body: (l) => ['group_id', l.grid(['channel', 'external_address'])] },
    edit: { body: (l) => ['group_id', l.grid(['channel', 'external_address'])] },
  },
});
