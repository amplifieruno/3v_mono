import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';

/** The registry key the monitoring operations are bound under. */
export const MONITORING_BINDING = 'monitoring';

/** One row of `itap_results.facility_occupancy_rows`: the facility (no `area_id`) or one area. */
export const occupancyRow = z.object({
  area_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  name: z.string(),
  capacity: z.number().nullable(),
  occupancy: z.number(),
  direct_occupancy: z.number(),
});

export type OccupancyRow = z.infer<typeof occupancyRow>;

/**
 * `facility_occupancy_now(hasura_session, p_facility)` with every row: the facility and each of
 * its areas, people counted once per person (merged identities included), an area with the
 * people of its sub-areas (`occupancy`) and on its own (`direct_occupancy`). The source of the
 * occupancy page's figures and colours; the areas' `current_occupancy` counts the same way.
 */
export const occupancyRowsOperation = hasuraOperation(MONITORING_BINDING, 'occupancyRows', {
  kind: 'query',
  document: `query OccupancyRows($facility: uuid!) {
  facility_occupancy_now(args: { p_facility: $facility }) {
    area_id
    parent_id
    name
    capacity
    occupancy
    direct_occupancy
  }
}`,
  variables: (input) => ({ facility: (input as { facilityId: string }).facilityId }),
  mapResult: (data) => {
    const rows = z.array(occupancyRow).safeParse(rootOf(data, 'facility_occupancy_now'));
    return rows.success ? rows.data : [];
  },
});

/** Who is in each area of a facility now (`itap:occupancy-rows`). */
export const occupancyRows = defineQuery('itap:occupancy-rows', {
  binding: occupancyRowsOperation.binding,
  input: schema(z.object({ facilityId: z.string().uuid() })),
  output: schema(z.array(occupancyRow)),
});
