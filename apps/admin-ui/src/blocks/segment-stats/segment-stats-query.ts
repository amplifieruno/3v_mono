import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SEGMENT_DAILY_STAT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { SEGMENT_STATS_READ_DAYS, readStart, segmentStatRow, segmentStatRows } from './segment-stats-series';

/** The registry key the segment trend's operation is bound under. */
export const SEGMENT_STATS_BINDING = 'segment-stats';

/**
 * The daily figures of one segment (`segment_daily_stats`, whose `day` is the organization's
 * calendar day) and the organization's time zone, read from a little over 30 days back so the
 * organization's window is covered whatever its zone (the start is a UTC date). The view folds
 * them into one point per organization day at the answer's time (one clock). The read's start is
 * taken when the request is made, so the cached input stays the segment id alone.
 */
export const segmentDailyStatsOperation = hasuraOperation(SEGMENT_STATS_BINDING, 'segmentDailyStats', {
  kind: 'query',
  document: `query SegmentDailyStats($segment: uuid!, $since: date!) {
  organizations(limit: 1) {
    timezone
  }
  segment_daily_stats(
    where: { segment_id: { _eq: $segment }, day: { _gte: $since } }
    order_by: [{ day: asc }]
    limit: ${SEGMENT_STATS_READ_DAYS + 2}
  ) {
    day
    member_count
    added
    removed
  }
}`,
  variables: (input) => ({
    segment: (input as { segmentId: string }).segmentId,
    since: readStart(new Date()),
  }),
  mapResult: (data) => {
    const rows = z.array(segmentStatRow).safeParse(rootOf(data, 'segment_daily_stats'));
    const organization = z.array(z.object({ timezone: z.string().nullable() })).safeParse(rootOf(data, 'organizations'));
    if (!rows.success) return null;
    return { timezone: organization.success ? (organization.data[0]?.timezone ?? null) : null, rows: rows.data };
  },
});

/** One segment's daily figures and the organization's time zone (`itap:segment-stats`). */
export const segmentDailyStats = defineQuery('itap:segment-daily-stats', {
  binding: segmentDailyStatsOperation.binding,
  input: schema(z.object({ segmentId: z.string().uuid() })),
  output: schema(segmentStatRows.nullable()),
  reads: [resourceByName(SEGMENT_DAILY_STAT_RESOURCE)],
});
