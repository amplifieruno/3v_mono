import { isLinkField } from '@burojs/core';
import type { ResourceMapping } from '@burojs/hasura';

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
