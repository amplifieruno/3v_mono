import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { MAX_PERIOD_DAYS } from '../charts/period';

/** The most segments the trend draws at once. */
export const SEGMENT_TREND_MAX = 10;

/**
 * How segments grew or shrank (`itap:segment-trend`, `segment_daily_stats`): one small line chart
 * of the member count per day for each segment, over the organization's last `days` calendar
 * days. Prop `segmentId` draws that segment alone; without it the `limit` segments with the most
 * members are drawn. Days the evaluation has not recorded stay gaps.
 */
export const segmentTrendBlock = defineBlock('itap:segment-trend', {
  texts: {
    label: 'Segment trends',
    loading: 'Reading the segment figures…',
    failed: 'The segment figures could not be read.',
    none: 'No daily segment figures over the period yet: they are recorded when segments are evaluated (hourly).',
    chart: 'Members of {{name}} per day',
    latest: 'now {{value}} · {{change}} over the period',
    today: 'today',
  },
  props: {
    segmentId: prop(z.string().nullable().optional()).default(null),
    days: prop(z.number().int().min(2).max(MAX_PERIOD_DAYS)).default(30),
    limit: prop(z.number().int().min(1).max(SEGMENT_TREND_MAX)).default(5),
  },
});
