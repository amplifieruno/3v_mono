import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * A segment's trend over the last 30 days (`itap:segment-stats`): the member count per day as a
 * line over a shaded area, and the people added and removed per day as bars above and below a
 * baseline, read by the view (`segmentDailyStats`). Prop `segmentId` (the segment page passes its record). Days the evaluation has not
 * recorded stay gaps; with no figures in the window it says so.
 */
export const segmentStatsBlock = defineBlock('itap:segment-stats', {
  texts: {
    label: 'Last 30 days',
    none: 'No daily figures in the last 30 days yet: they are recorded when the segment is evaluated (hourly).',
    members: 'Members',
    churn: 'Added and removed',
    latest: 'now {{value}}',
    range: 'min {{min}} · max {{max}}',
    totals: '+{{added}} added · −{{removed}} removed',
    membersChart: 'Members per day over the last 30 days',
    churnChart: 'People added and removed per day over the last 30 days',
    membersPoint: '{{day}}: {{value}} members',
    churnPoint: '{{day}}: +{{added}} / −{{removed}}',
    noDay: '{{day}}: no figures',
    start: '30 days ago',
    today: 'today',
    loading: 'Reading the daily figures…',
    failed: 'The daily figures could not be read.',
  },
  props: {
    segmentId: prop(z.string().nullable().optional()).default(null),
  },
});
