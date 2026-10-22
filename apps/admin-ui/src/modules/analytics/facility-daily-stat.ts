import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { FACILITY_DAILY_STAT_RESOURCE } from '../../data/resource-names';
import { facilityRelation } from '../monitoring/place-fields';
import { computedAt, statFigure } from './stat-field';

/** Columns of `itap.facility_daily_stats` the `org_admin` role reads; all written by `aggregate_stats`. */
export const facilityDailyStatFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  day: f.date({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Day', doc: { summary: 'The calendar day in the facility’s time zone, midnight to midnight.' } },
  }),
  facility_id: facilityRelation('The facility the figures are of.'),
  unique_identities: statFigure('People', 'Distinct people present that day; merged identities count once.'),
  known_identities: statFigure('Known', 'People present that day who are linked to a profile.'),
  unknown_identities: statFigure('Unknown', 'People present that day with no profile: faces the platform tracks but cannot name.'),
  visits: statFigure('Visits', 'Tracking sessions that started that day: each arrival at the facility counts once.'),
  guest_visits: statFigure('Guest visits', 'Planned visits (with a host) checked in that day.'),
  avg_visit_minutes: statFigure('Average visit (min)', 'How long the visits that started that day lasted on average, in minutes.'),
  dwell_seconds: statFigure('Presence (s)', 'Seconds of presence within the day, summed over the people.', ['show']),
  peak_occupancy: statFigure('Peak', 'The most people present at the same instant that day.'),
  peak_hour: statFigure('Peak hour', 'The facility’s clock hour (0–23) when the peak was first reached; empty when nobody came.'),
  updated_at: computedAt(),
};

/**
 * Daily figures per facility (`itap.facility_daily_stats`), on the facility's calendar days, written
 * by the hourly aggregation (a day in progress counts everything so far). Read only; narrowed by
 * the sidebar facility. The Analytics page's occupancy chart reads them by day.
 */
export const facilityDailyStat = defineResource(FACILITY_DAILY_STAT_RESOURCE, {
  texts: {
    label: 'Daily figure',
    labelPlural: 'Daily figures',
    doc: {
      summary:
        'A facility’s day in figures: people present (known and unknown), visits and their length, guest visits, and the peak with its hour; computed from the tracking history.',
    },
  },
  basePath: '/daily-stats',
  section: NAV_SECTIONS.analytics,
  order: 10,
  icon: NAV_ICONS.dailyStats,
  displayField: 'day',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: facilityDailyStatFields,
  views: {
    list: {
      columns: ['day', 'facility_id', 'unique_identities', 'known_identities', 'unknown_identities', 'visits', 'peak_occupancy', 'peak_hour'],
      optionalColumns: ['guest_visits', 'avg_visit_minutes', 'dwell_seconds'],
      defaultSort: [{ field: 'day', direction: 'desc' }],
      sortTiebreaker: 'id',
      pageSize: 50,
      filters: { fields: ['facility_id', 'day', 'unique_identities'] },
    },
    show: {
      header: (l) => [l.grid(['day', 'facility_id'])],
      body: (l) => [
        l.grid(['unique_identities', 'known_identities', 'unknown_identities']),
        l.grid(['visits', 'guest_visits', 'avg_visit_minutes']),
        l.grid(['peak_occupancy', 'peak_hour', 'dwell_seconds']),
        'updated_at',
      ],
    },
  },
});
