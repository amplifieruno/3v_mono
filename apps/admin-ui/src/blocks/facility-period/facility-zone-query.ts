import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { FACILITY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from './analytics-binding';

/** A facility as the analytics blocks need it: its name and the zone its days are counted in. */
export const facilityZone = z.object({ id: z.string(), name: z.string(), timezone: z.string().nullable() });

export type FacilityZone = z.infer<typeof facilityZone>;

/**
 * One facility's name and time zone, read before a block reads its stats: the facility's
 * midnights bound the period (`../charts/period.ts`) and its clock labels the hours. `null` for a
 * facility the session cannot read (another organization's, or deleted).
 */
export const facilityZoneOperation = hasuraOperation(ANALYTICS_BINDING, 'facilityZone', {
  kind: 'query',
  document: `query FacilityZone($facility: uuid!) {
  facilities_by_pk(id: $facility) {
    id
    name
    timezone
  }
}`,
  variables: (input) => ({ facility: (input as { facilityId: string }).facilityId }),
  mapResult: (data) => {
    const row = facilityZone.safeParse(rootOf(data, 'facilities_by_pk'));
    return row.success ? row.data : null;
  },
});

/** A facility's name and time zone (`itap:facility-zone`). */
export const facilityZoneQuery = defineQuery('itap:facility-zone', {
  binding: facilityZoneOperation.binding,
  input: schema(z.object({ facilityId: z.string().uuid() })),
  output: schema(facilityZone.nullable()),
  reads: [resourceByName(FACILITY_RESOURCE)],
});
