import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../data/operations';
import { resourceByName } from '../data/resource-by-name';
import { AREA_RESOURCE, FACILITY_RESOURCE, SEGMENT_RESOURCE } from '../data/resource-names';
import { schema } from '../data/schema';
import type { ConditionReferences } from './notification-conditions-format';

/** The registry key the conditions' operation is bound under. */
export const NOTIFICATION_CONDITIONS_BINDING = 'notification-conditions';

/** The most records of each kind the editor offers (a demo organization has far fewer). */
export const CONDITION_CHOICES_MAX = 1000;

const named = z.object({ id: z.string(), name: z.string() });

export const conditionReferences = z.object({
  facilities: z.array(named),
  areas: z.array(named.extend({ facility_id: z.string() })),
  segments: z.array(named),
});

const listOf = <T extends z.ZodTypeAny>(item: T, data: unknown, root: string): z.infer<T>[] => {
  const parsed = z.array(item).safeParse(rootOf(data, root));
  return parsed.success ? parsed.data : [];
};

export const conditionReferencesOperation = hasuraOperation(NOTIFICATION_CONDITIONS_BINDING, 'conditionReferences', {
  kind: 'query',
  document: `query NotificationConditionReferences($limit: Int!) {
  facilities(order_by: { name: asc }, limit: $limit) { id name }
  areas(order_by: { name: asc }, limit: $limit) { id name facility_id }
  segments(order_by: { name: asc }, limit: $limit) { id name }
}`,
  variables: () => ({ limit: CONDITION_CHOICES_MAX }),
  mapResult: (data): ConditionReferences => ({
    facilities: listOf(named, data, 'facilities'),
    areas: listOf(named.extend({ facility_id: z.string() }), data, 'areas'),
    segments: listOf(named, data, 'segments'),
  }),
});

/**
 * The facilities, areas and segments of the organization a notification rule's conditions can
 * name: the editor's choices, the display's names and the reference checks of the input.
 */
export const notificationConditionReferences = defineQuery('itap:notification-condition-references', {
  binding: conditionReferencesOperation.binding,
  input: schema(z.object({})),
  output: schema(conditionReferences),
  // A facility, area or segment created or renamed elsewhere refreshes the choices.
  reads: [resourceByName(FACILITY_RESOURCE), resourceByName(AREA_RESOURCE), resourceByName(SEGMENT_RESOURCE)],
});
