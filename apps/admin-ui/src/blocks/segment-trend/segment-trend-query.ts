import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SEGMENT_DAILY_STAT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { trendRead, trendReadStart, trendRow } from './segment-trend-shape';

/** The most daily rows one read takes (segments × days), newest first: past it the oldest days are cut and `truncated` says so. */
export const SEGMENT_TREND_ROW_LIMIT = 10_000;

const trendInput = z.object({ segmentId: z.string().uuid().nullable(), days: z.number().int().min(1) });

/**
 * The daily figures of every segment (or one) from a little before the period (the start is a UTC
 * date, so the organization's days are covered in any zone) and the organization's time zone, to
 * cut the period on its calendar. The start is taken when the request is made, so the cached input
 * stays the segment and the length.
 */
export const segmentTrendOperation = hasuraOperation(ANALYTICS_BINDING, 'segmentTrend', {
  kind: 'query',
  document: `query SegmentTrend($where: segment_daily_stats_bool_exp!) {
  organizations(limit: 1) {
    timezone
  }
  segment_daily_stats(where: $where, order_by: [{ day: desc }, { segment_id: asc }], limit: ${SEGMENT_TREND_ROW_LIMIT}) {
    segment_id
    day
    member_count
    segment {
      name
    }
  }
}`,
  variables: (input) => {
    const { segmentId, days } = input as z.infer<typeof trendInput>;
    const since = trendReadStart(new Date(), days);
    return { where: { day: { _gte: since }, ...(segmentId === null ? {} : { segment_id: { _eq: segmentId } }) } };
  },
  mapResult: (data) => {
    const rows = z.array(trendRow).safeParse(rootOf(data, 'segment_daily_stats'));
    const organization = z.array(z.object({ timezone: z.string().nullable() })).safeParse(rootOf(data, 'organizations'));
    if (!rows.success) return null;
    return {
      timezone: organization.success ? (organization.data[0]?.timezone ?? null) : null,
      rows: rows.data,
      truncated: rows.data.length >= SEGMENT_TREND_ROW_LIMIT,
    };
  },
});

/** The segments' daily figures (`itap:segment-trend`). */
export const segmentTrend = defineQuery('itap:segment-trend-rows', {
  binding: segmentTrendOperation.binding,
  input: schema(trendInput),
  output: schema(trendRead.nullable()),
  reads: [resourceByName(SEGMENT_DAILY_STAT_RESOURCE)],
});
