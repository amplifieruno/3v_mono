import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';

/** The registry key the places operations are bound under. */
export const PLACES_BINDING = 'places';

/** One row of `itap_results.facility_occupancy_rows`: the facility (no `area_id`) or one area. */
const occupancyRow = z.object({
  area_id: z.string().nullable(),
  capacity: z.number().nullable(),
  occupancy: z.number(),
  direct_occupancy: z.number(),
});

type OccupancyRow = z.infer<typeof occupancyRow>;

/** The figures the facility header shows. */
export const facilityOccupancyOutput = z
  .object({
    occupancy: z.number(),
    occupied_areas: z.number(),
    areas_over_capacity: z.number(),
  })
  .nullable();

export type FacilityOccupancy = z.infer<typeof facilityOccupancyOutput>;

/**
 * The header figures from the rows of `facility_occupancy_now`: the facility row's
 * occupancy, the areas someone is directly placed in, the areas holding more people
 * (their subtree included) than their capacity. `null` when the facility row is missing
 * (not this organization's facility, or deleted).
 */
export function summarizeOccupancy(rows: readonly OccupancyRow[]): FacilityOccupancy {
  const facility = rows.find((row) => row.area_id === null);
  if (facility === undefined) return null;
  const areas = rows.filter((row) => row.area_id !== null);
  return {
    occupancy: facility.occupancy,
    occupied_areas: areas.filter((row) => row.direct_occupancy > 0).length,
    areas_over_capacity: areas.filter((row) => row.capacity !== null && row.occupancy > row.capacity)
      .length,
  };
}

/**
 * `facility_occupancy_now(hasura_session, p_facility)`: one row for the facility and one
 * per area, people counted once per identity (merged identities included). Hasura fills
 * the session argument from the token.
 */
export const facilityOccupancyNowOperation = hasuraOperation(PLACES_BINDING, 'facilityOccupancyNow', {
  kind: 'query',
  document: `query FacilityOccupancyNow($facility: uuid!) {
  facility_occupancy_now(args: { p_facility: $facility }) {
    area_id
    capacity
    occupancy
    direct_occupancy
  }
}`,
  variables: (input) => ({ facility: (input as { facilityId: string }).facilityId }),
  mapResult: (data) => {
    const rows = z.array(occupancyRow).safeParse(rootOf(data, 'facility_occupancy_now'));
    return rows.success ? summarizeOccupancy(rows.data) : null;
  },
});

/**
 * Who is in the facility now (the tracked SQL function `facility_occupancy_now`), shown as
 * facts on the facility page header. Computed per request from the current placements.
 */
export const facilityOccupancyNow = defineQuery('itap:facility-occupancy-now', {
  binding: facilityOccupancyNowOperation.binding,
  input: schema(z.object({ facilityId: z.string().uuid() })),
  output: schema(facilityOccupancyOutput),
  fields: {
    occupancy: f.number({
      texts: {
        label: 'On site now',
        doc: {
          summary:
            'Distinct people currently placed in an area of this facility; merged identities count once.',
        },
      },
    }),
    occupied_areas: f.number({
      texts: {
        label: 'Occupied areas',
        doc: { summary: 'Areas where at least one person is placed right now (not counting sub-areas).' },
      },
    }),
    areas_over_capacity: f.number({
      texts: {
        label: 'Areas over capacity',
        doc: {
          summary:
            'Areas with a capacity that hold more people than it now, people in their sub-areas included.',
        },
      },
    }),
  },
});

/** The facts the facility header shows, in order. */
export const FACILITY_OCCUPANCY_ROWS = ['occupancy', 'occupied_areas', 'areas_over_capacity'] as const;
