import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../data/operations';
import { resourceByName } from '../data/resource-by-name';
import {
  AREA_RESOURCE,
  COMPANY_RESOURCE,
  CUSTOM_ATTRIBUTE_RESOURCE,
  FACILITY_RESOURCE,
  SEGMENT_RESOURCE,
  WORK_SCHEDULE_RESOURCE,
} from '../data/resource-names';
import { schema } from '../data/schema';
import type { CatalogField } from './segment-conditions-operators';
import type { ConditionRefs } from './segment-conditions-refs';

/** The registry key the conditions' operation is bound under. */
export const SEGMENT_CONDITIONS_BINDING = 'segment-conditions';

/**
 * The most records of each kind the editor offers (a demo organization has far fewer). A record
 * past the cap is not in the lists, so the client validator flags a condition naming it as "gone";
 * a demo-size limit, not a framework gap.
 */
export const SEGMENT_CHOICES_MAX = 1000;

const named = z.object({ id: z.string(), name: z.string() });
const catalogRow = z.object({
  field: z.string(),
  value_type: z.string(),
  operators: z.array(z.string()),
  enum_values: z.array(z.string()).nullable(),
  label: z.string(),
});

export const segmentConditionsData = z.object({
  fields: z.array(
    z.object({
      field: z.string(),
      type: z.string(),
      operators: z.array(z.string()),
      enumValues: z.array(z.string()).nullable(),
      label: z.string(),
    }),
  ),
  refs: z.object({
    companies: z.array(named),
    work_schedules: z.array(named),
    areas: z.array(named.extend({ facility_id: z.string() })),
    facilities: z.array(named),
    segments: z.array(named.extend({ kind: z.string(), target: z.string() })),
  }),
});

export type SegmentConditionsData = { readonly fields: readonly CatalogField[]; readonly refs: ConditionRefs };

const listOf = <T extends z.ZodTypeAny>(item: T, data: unknown, root: string): z.infer<T>[] => {
  const parsed = z.array(item).safeParse(rootOf(data, root));
  return parsed.success ? parsed.data : [];
};

export const segmentConditionsOperation = hasuraOperation(SEGMENT_CONDITIONS_BINDING, 'catalog', {
  kind: 'query',
  document: `query SegmentConditionsCatalog($target: String!, $limit: Int!) {
  segment_fields(args: { p_target: $target }) { field value_type operators enum_values label }
  companies(order_by: { name: asc }, limit: $limit) { id name }
  work_schedules(order_by: { name: asc }, limit: $limit) { id name }
  areas(order_by: { name: asc }, limit: $limit) { id name facility_id }
  facilities(order_by: { name: asc }, limit: $limit) { id name }
  segments(order_by: { name: asc }, limit: $limit) { id name kind target }
}`,
  variables: (input) => ({ target: (input as { readonly target: string }).target, limit: SEGMENT_CHOICES_MAX }),
  mapResult: (data): SegmentConditionsData => ({
    fields: listOf(catalogRow, data, 'segment_fields').map((row) => ({
      field: row.field,
      type: row.value_type,
      operators: row.operators,
      enumValues: row.enum_values,
      label: row.label,
    })),
    refs: {
      companies: listOf(named, data, 'companies'),
      work_schedules: listOf(named, data, 'work_schedules'),
      areas: listOf(named.extend({ facility_id: z.string() }), data, 'areas'),
      facilities: listOf(named, data, 'facilities'),
      segments: listOf(named.extend({ kind: z.string(), target: z.string() }), data, 'segments'),
    },
  }),
});

/**
 * The field catalog of a segment target (`segment_fields`: fields, types, operators, enum values;
 * the organization's active custom fields included for profiles) and the records a condition can
 * name: the conditions editor's choices, the display's names and the client validation.
 */
export const segmentConditionsCatalog = defineQuery('itap:segment-conditions-catalog', {
  binding: segmentConditionsOperation.binding,
  input: schema(z.object({ target: z.string() })),
  output: schema(segmentConditionsData),
  // A custom field switched on or off, or a record created or renamed elsewhere, refreshes the editor.
  reads: [
    resourceByName(CUSTOM_ATTRIBUTE_RESOURCE),
    resourceByName(COMPANY_RESOURCE),
    resourceByName(WORK_SCHEDULE_RESOURCE),
    resourceByName(AREA_RESOURCE),
    resourceByName(FACILITY_RESOURCE),
    resourceByName(SEGMENT_RESOURCE),
  ],
});
