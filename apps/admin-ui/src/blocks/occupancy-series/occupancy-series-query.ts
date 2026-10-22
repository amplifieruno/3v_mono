import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';
import { SERIES_BUCKETS } from '../charts/period';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { seriesRow } from './occupancy-series-shape';

/** What the series is read for: a facility, a `[from, to)` period and a bucket. */
export const seriesInput = z.object({
  facilityId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  bucket: z.enum(SERIES_BUCKETS),
});

export type SeriesInput = z.infer<typeof seriesInput>;

/**
 * `occupancy_series(hasura_session, p_facility, p_from, p_to, p_bucket)`: one row per UTC hour
 * (`hour`) or per facility-local day (`day`) overlapping the period, empty buckets zero-filled.
 * The period is chosen by the block (`../charts/period.ts`): whole facility days for `day`, so the
 * server's days and the block's agree.
 */
export const occupancySeriesOperation = hasuraOperation(ANALYTICS_BINDING, 'occupancySeries', {
  kind: 'query',
  document: `query OccupancySeries($facility: uuid!, $from: timestamptz!, $to: timestamptz!, $bucket: String!) {
  occupancy_series(args: { p_facility: $facility, p_from: $from, p_to: $to, p_bucket: $bucket }) {
    bucket_start
    day
    unique_identities
    entries
    exits
    dwell_seconds
    avg_dwell_seconds
    peak_occupancy
  }
}`,
  variables: (input) => {
    const { facilityId, from, to, bucket } = input as SeriesInput;
    return { facility: facilityId, from, to, bucket };
  },
  mapResult: (data) => {
    const rows = z.array(seriesRow).safeParse(rootOf(data, 'occupancy_series'));
    return rows.success ? rows.data : null;
  },
});

/** A facility's occupancy per bucket over a period (`itap:occupancy-series`). */
export const occupancySeries = defineQuery('itap:occupancy-series-rows', {
  binding: occupancySeriesOperation.binding,
  input: schema(seriesInput),
  output: schema(z.array(seriesRow).nullable()),
});
