import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { AREA_HOURLY_STAT_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { areaRelation, facilityRelation } from '../monitoring/place-fields';
import { computedAt, statFigure } from './stat-field';

/** Columns of `itap.area_hourly_stats` the `org_admin` role reads; all written by `aggregate_stats`. */
export const areaHourlyStatFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  hour: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Hour', doc: { summary: 'The start of the hour the figures cover (whole UTC hours), shown in your own time zone.' } },
  }),
  facility_id: facilityRelation('The facility the figures are of.'),
  area_id: areaRelation(
    'The area the people were located in (its own area, not its sub-areas). Empty: the facility as a whole, everyone present whether placed in an area or not.',
  ),
  unique_identities: statFigure('People', 'Distinct people present at some point of the hour; merged identities count once.'),
  entries: statFigure('Entries', 'Times someone came into the area (or the facility) during the hour.'),
  exits: statFigure('Exits', 'Times someone left during the hour. The end of a visit still in progress is not an exit.'),
  dwell_seconds: statFigure('Presence (s)', 'Seconds of presence within the hour, summed over the people (one person counted once at a time).'),
  avg_dwell_seconds: statFigure('Average presence (s)', 'Presence seconds divided by the people present; empty without anyone.'),
  peak_occupancy: statFigure('Peak', 'The most people present at the same instant during the hour.'),
  updated_at: computedAt(),
};

/**
 * Hourly figures per area and facility (`itap.area_hourly_stats`), written by the hourly aggregation
 * (`aggregate_stats`) from the tracking history; only hours with someone present have a row.
 * Read only; narrowed by the sidebar facility. The Analytics page charts them.
 */
export const areaHourlyStat = defineResource(AREA_HOURLY_STAT_RESOURCE, {
  texts: {
    label: 'Hourly figure',
    labelPlural: 'Hourly figures',
    doc: {
      summary:
        'How many people were in an area (or the whole facility) during one hour, how many came and went, how long they stayed and the peak; computed from the tracking history every hour.',
    },
  },
  basePath: '/hourly-stats',
  section: NAV_SECTIONS.analytics,
  order: 20,
  icon: NAV_ICONS.hourlyStats,
  displayField: 'hour',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: areaHourlyStatFields,
  views: {
    list: {
      columns: ['hour', 'facility_id', 'area_id', 'unique_identities', 'entries', 'exits', 'peak_occupancy'],
      optionalColumns: ['dwell_seconds', 'avg_dwell_seconds'],
      defaultSort: [{ field: 'hour', direction: 'desc' }],
      sortTiebreaker: 'id',
      pageSize: 50,
      filters: { pinned: ['area_id'], fields: ['area_id', 'facility_id', 'hour', 'unique_identities'] },
    },
    show: {
      header: (l) => [l.grid(['hour', 'facility_id', 'area_id'])],
      body: (l) => [
        l.grid(['unique_identities', 'peak_occupancy', 'entries', 'exits']),
        l.grid(['dwell_seconds', 'avg_dwell_seconds']),
        'updated_at',
      ],
    },
  },
});
