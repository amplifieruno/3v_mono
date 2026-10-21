import { isLinkField } from '@burojs/core';
import type { ResourceMapping } from '@burojs/hasura';
import { INVITATION_RESOURCE, invitationFields } from '../modules/organization/invitations';
import { MEMBER_RESOURCE, memberFields } from '../modules/organization/members';
import { ORGANIZATION_RESOURCE, organizationFields } from '../modules/organization/organization';
import { USER_RESOURCE, userFields } from '../modules/organization/user';
import { FACILITY_RESOURCE, facilityFields } from '../modules/places/facility';

/** One resource's Hasura mapping (`@burojs/hasura`'s `ResourceMapping`). */
export type HasuraResourceMapping = ResourceMapping;

/**
 * A mapping for an `itap.*` table, by its GraphQL `custom_name` (no schema
 * prefix). Every ITAP table has a uuid `id` primary key and a `created_at`
 * column, which are the defaults here; `opts` overrides any of them.
 */
export function hasuraTable(
  table: string,
  opts: Partial<HasuraResourceMapping> = {},
): HasuraResourceMapping {
  return {
    table,
    selectFields: [],
    pkType: 'uuid',
    pkField: 'id',
    orderByField: 'created_at',
    ...opts,
  };
}

/**
 * The columns a resource selects, derived from its declared field map so the
 * two lists cannot drift (a declared field missing from `selectFields` would
 * render empty forever). Field names equal column names. Links (many-to-many
 * through a junction) and dotted relation columns are not columns of the table
 * and are left out.
 */
export function selectFieldsOf(fields: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(fields)
    .filter(([name, field]) => {
      if (name.includes('.')) return false;
      return !(
        typeof field === 'object' &&
        field !== null &&
        isLinkField(field as Record<string, unknown>)
      );
    })
    .map(([name]) => name);
}

/**
 * The Hasura mapping of every console resource, keyed by the resource's data
 * binding (its name unless `data.resource` says otherwise). Each module adds
 * its entries here; `tests/integration/schema-mapping.dev.test.ts` checks every
 * entry against the live schema.
 */
export const ITAP_TABLES: Record<string, HasuraResourceMapping> = {
  [ORGANIZATION_RESOURCE]: hasuraTable('organizations', {
    selectFields: selectFieldsOf(organizationFields),
  }),
  [FACILITY_RESOURCE]: hasuraTable('facilities', {
    selectFields: selectFieldsOf(facilityFields),
  }),
  [MEMBER_RESOURCE]: hasuraTable('organization_members', {
    selectFields: selectFieldsOf(memberFields),
  }),
  [INVITATION_RESOURCE]: hasuraTable('organization_invitations', {
    selectFields: selectFieldsOf(invitationFields),
  }),
  /**
   * `auth.users` (Nhost): camelCase columns, custom root names (`user` by pk),
   * no `created_at` and no aggregate for `org_admin`.
   */
  [USER_RESOURCE]: hasuraTable('users', {
    selectFields: selectFieldsOf(userFields),
    byPkRoot: 'user',
    aggregate: false,
    orderByField: 'displayName',
  }),
};
