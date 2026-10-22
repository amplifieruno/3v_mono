import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SEGMENT_DAILY_STAT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { SEGMENT_STATS_DAYS, dailyPoints, segmentStatRow, segmentStatSeries, windowStart } from './segment-stats-series';

/** The registry key the segment trend's operation is bound under. */
export const SEGMENT_STATS_BINDING = 'segment-stats';

/**
 * The daily figures of one segment over the last 30 days (`segment_daily_stats`), folded into
 * one point per day when the answer arrives. The window starts when the request is made, so the
 * cached input stays the segment id alone.
 */
export const segmentDailyStatsOperation = hasuraOperation(SEGMENT_STATS_BINDING, 'segmentDailyStats', {
  kind: 'query',
  document: `query SegmentDailyStats($segment: uuid!, $since: date!) {
  segment_daily_stats(
    where: { segment_id: { _eq: $segment }, day: { _gte: $since } }
    order_by: [{ day: asc }]
    limit: ${SEGMENT_STATS_DAYS + 5}
  ) {
    day
    member_count
    added
    removed
  }
}`,
  variables: (input) => ({
    segment: (input as { segmentId: string }).segmentId,
    since: windowStart(new Date()),
  }),
  mapResult: (data) => {
    const rows = z.array(segmentStatRow).safeParse(rootOf(data, 'segment_daily_stats'));
    return rows.success ? dailyPoints(rows.data, new Date()) : null;
  },
});

/** One segment's members, additions and removals per day over the last 30 days (`itap:segment-stats`). */
export const segmentDailyStats = defineQuery('itap:segment-daily-stats', {
  binding: segmentDailyStatsOperation.binding,
  input: schema(z.object({ segmentId: z.string().uuid() })),
  output: schema(segmentStatSeries.nullable()),
  reads: [resourceByName(SEGMENT_DAILY_STAT_RESOURCE)],
});
