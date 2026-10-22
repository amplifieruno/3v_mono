import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';

export { USER_RESOURCE };

/**
 * Columns of `auth.users` the `org_admin` role reads (GraphQL names: the
 * Nhost auth table renames its columns to camelCase). The module's `index.ts` mapping selects
 * exactly these.
 */
export const userFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  displayName: f.string({ write: 'never', texts: 'Name' }),
  email: f.email({ write: 'never', texts: 'Email' }),
};

/**
 * A sign-in account, read-only: the target of the user columns of members and
 * invitations, which show its name. Accounts are created by signing up through
 * an invitation and managed by the auth service, so the console has no screen
 * of its own for them.
 */
export const user = defineResource(USER_RESOURCE, {
  texts: {
    label: 'User',
    labelPlural: 'Users',
    doc: {
      summary:
        'A sign-in account. Only accounts that are members of the current organization are visible; one account can belong to several organizations.',
    },
  },
  displayField: 'displayName',
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  data: { provider: 'hasura' },
  fields: userFields,
  views: {
    list: { page: false },
  },
});
