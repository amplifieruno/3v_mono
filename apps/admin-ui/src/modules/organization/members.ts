import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { enumField } from '../../enums/field';
import {
  MEMBER_ROLES,
  MEMBER_ROLE_ENUM,
  MEMBER_STATUSES,
  MEMBER_STATUS_ENUM,
} from '../../enums/tenancy';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { USER_RESOURCE } from './user';

export const MEMBER_RESOURCE = 'organization_member';

const roleField = enumField(MEMBER_ROLES, MEMBER_ROLE_ENUM, {
  write: 'never',
  texts: {
    label: 'Role',
    doc: { summary: 'What the member may do in this organization.' },
  },
});

const statusField = enumField(MEMBER_STATUSES, MEMBER_STATUS_ENUM, {
  write: 'never',
  texts: {
    label: 'Status',
    doc: {
      summary:
        'Only an active member whose membership has not expired can sign in to the organization.',
    },
  },
});

/**
 * Columns of `itap.organization_members` this phase reads; the module's `index.ts` mapping
 * selects the table's own columns, and the list reads the account's email
 * across the `user` relationship as the dotted column `user_id.email`.
 */
export const memberFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  user_id: f.relation({
    to: USER_RESOURCE,
    write: 'never',
    open: 'none',
    providerOptions: { relationship: 'user' },
    texts: {
      label: 'User',
      doc: { summary: 'The sign-in account of the member, shown by its name.' },
    },
  }),
  role: roleField,
  status: statusField,
  title: f.string({ nullable: true, write: 'never', texts: 'Job title' }),
  department: f.string({ nullable: true, write: 'never', texts: 'Department' }),
  joined_at: f.dateTime({
    system: true,
    texts: {
      label: 'Joined',
      doc: { summary: 'When the member accepted the invitation and joined the organization.' },
    },
  }),
  expires_at: f.dateTime({
    nullable: true,
    write: 'never',
    texts: {
      label: 'Expires',
      doc: {
        summary:
          'After this time the membership no longer grants access; empty means it does not expire.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [] }),
};

/**
 * The people who can sign in to the organization. Read-only in this phase:
 * people join by accepting an invitation (`./invitations.ts`).
 */
export const organizationMember = defineResource(MEMBER_RESOURCE, {
  texts: {
    label: 'Member',
    labelPlural: 'Members',
    doc: {
      summary:
        'A person who can sign in to this organization. New members join by accepting an invitation; the same account can be a member of several organizations.',
    },
  },
  basePath: '/members',
  section: NAV_SECTIONS.organization,
  order: 10,
  icon: NAV_ICONS.members,
  displayField: 'user_id',
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  data: { provider: 'hasura' },
  fields: memberFields,
  views: {
    list: {
      columns: [
        'user_id',
        'user_id.email',
        'role',
        'status',
        'title',
        'department',
        'joined_at',
        'expires_at',
      ],
      defaultSort: [{ field: 'joined_at', direction: 'desc' }],
      filters: { fields: ['status'] },
    },
  },
});
