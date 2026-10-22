import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { MAX_PERIOD_DAYS, SERIES_BUCKETS } from '../charts/period';

/**
 * A facility's occupancy over a period (`itap:occupancy-series`, `occupancy_series`): the people
 * present per hour or per day as a line, and the entries and exits per bucket as columns above and
 * below a baseline. Props `facilityId` (the sidebar facility on the Analytics page, a widget's
 * `facility_id`), `days` (the period: the last so many days, today included) and `bucket`
 * (`hour` / `day`; by default hours up to 7 days, days beyond). Day buckets are the facility's
 * calendar days, cut at its own midnight; hours are labelled by its clock.
 */
export const occupancySeriesBlock = defineBlock('itap:occupancy-series', {
  texts: {
    label: 'Occupancy over time',
    chooseFacility: 'Choose a facility in the sidebar to see its occupancy over time.',
    loading: 'Reading the occupancy figures…',
    failed: 'The occupancy figures could not be read.',
    missing: 'This facility cannot be read.',
    none: 'Nobody was recorded in this facility over the period.',
    people: 'People present',
    peopleHourChart: 'Distinct people present per hour',
    peopleDayChart: 'Distinct people present per day',
    peopleSummary: 'most {{max}}',
    flow: 'Entries and exits',
    flowChart: 'Entries above the line, exits below, per bucket',
    flowSummary: '{{entries}} entries · {{exits}} exits',
    flowPoint: '{{label}}: {{entries}} in / {{exits}} out',
    peak: 'Peak on site: {{peak}} people ({{when}})',
    zone: 'Times in the facility’s time zone ({{zone}}).',
    day: 'Day',
    hour: 'Hour',
    entries: 'Entries',
    exits: 'Exits',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    days: prop(z.number().int().min(1).max(MAX_PERIOD_DAYS)).default(7),
    bucket: prop(z.enum(SERIES_BUCKETS).nullable().optional()).default(null),
  },
});
