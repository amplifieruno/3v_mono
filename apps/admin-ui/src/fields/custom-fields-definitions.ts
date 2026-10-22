import { useList } from '@burojs/react';
import * as React from 'react';
import type { AttributeDefinition } from './custom-fields-check';
import { CUSTOM_ATTRIBUTE_RESOURCE } from '../data/resource-names';

/** More attributes than one organization defines for an entity; one page is read. */
const DEFINITIONS_PAGE_SIZE = 500;

export type DefinitionsState =
  | { readonly status: 'pending' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly definitions: readonly AttributeDefinition[] };

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/** One `custom_attribute_definitions` row as the field reads it (options: a list of texts or none). */
export function definitionOf(row: Readonly<Record<string, unknown>>): AttributeDefinition {
  const key = text(row.key, '');
  return {
    key,
    label: text(row.label, key),
    data_type: text(row.data_type, 'string'),
    options: Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === 'string')
      : null,
    required: row.required === true,
    is_active: row.is_active === true,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
  };
}

/**
 * Every custom attribute definition of `entity`, active and inactive (the inactive ones
 * tell a kept value from one whose attribute is gone), read through the resource of
 * `modules/organization/custom-attributes.ts` and never narrowed by the facility picker.
 */
export function useAttributeDefinitions(entity: string): DefinitionsState {
  const list = useList(CUSTOM_ATTRIBUTE_RESOURCE, {
    scope: 'none',
    filter: { field: 'entity', op: 'eq', value: entity },
    sort: [{ field: 'sort_order', direction: 'asc' }],
    pagination: { kind: 'offset', page: 1, pageSize: DEFINITIONS_PAGE_SIZE },
  });
  const rows = list.data?.data;
  const definitions = React.useMemo(
    () => (rows as readonly Readonly<Record<string, unknown>>[] | undefined)?.map(definitionOf),
    [rows],
  );
  if (definitions !== undefined) return { status: 'ready', definitions };
  return list.isError ? { status: 'error' } : { status: 'pending' };
}
