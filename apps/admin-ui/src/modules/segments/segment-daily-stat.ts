import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { SEGMENT_DAILY_STAT_RESOURCE, SEGMENT_RESOURCE } from '../../data/resource-names';

/** Columns of `itap.segment_daily_stats` the `org_admin` role reads (select only; written by the evaluation). */
export const segmentDailyStatFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  segment_id: f.relation({
    to: SEGMENT_RESOURCE,
    system: true,
    providerOptions: { relationship: 'segment' },
    texts: { label: 'Segment', doc: { summary: 'The segment the figures are of.' } },
  }),
  day: f.date({
    system: true,
    texts: { label: 'Day', doc: { summary: 'The calendar day in the organization’s time zone.' } },
  }),
  member_count: f.number({
    system: true,
    texts: { label: 'Members', doc: { summary: 'How many were members at the end of the day (or now, for today).' } },
  }),
  added: f.number({
    system: true,
    texts: { label: 'Added', doc: { summary: 'How many became members that day, by hand or by the conditions.' } },
  }),
  removed: f.number({
    system: true,
    texts: {
      label: 'Removed',
      doc: { summary: 'How many stopped being members that day. A pinned member (a rule membership turned manual) counts as neither.' },
    },
  }),
};

/**
 * A segment's figures per day (`itap.segment_daily_stats`, refreshed by the hourly evaluation):
 * read only, shown under the trend chart on the segment's Trend tab. No page of its own.
 */
export const segmentDailyStat = defineResource(SEGMENT_DAILY_STAT_RESOURCE, {
  texts: {
    label: 'Daily figures',
    labelPlural: 'Daily figures',
    doc: { summary: 'A segment’s member count, additions and removals per day, recorded by the evaluation; read only.' },
  },
  basePath: '/segment-daily-stats',
  displayField: 'day',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: segmentDailyStatFields,
  views: {
    list: { page: false, columns: ['day', 'member_count', 'added', 'removed'], defaultSort: [{ field: 'day', direction: 'desc' }] },
    show: { page: false },
  },
});
