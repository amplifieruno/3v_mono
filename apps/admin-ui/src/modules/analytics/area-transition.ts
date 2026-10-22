import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { AREA_TRANSITION_RESOURCE } from '../../data/resource-names';
import { areaRelation, facilityRelation } from '../monitoring/place-fields';
import { computedAt, statFigure } from './stat-field';

/** Columns of `itap.area_transitions_daily` the `org_admin` role reads; all written by `aggregate_stats`. */
export const areaTransitionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  day: f.date({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Day', doc: { summary: 'The calendar day in the facility’s time zone on which the people arrived in the second area.' } },
  }),
  facility_id: facilityRelation('The facility of both areas.'),
  from_area_id: areaRelation('The area people left.', undefined, 'from_area', 'From'),
  to_area_id: areaRelation('The area they were seen in next, on the same visit.', undefined, 'to_area', 'To'),
  count: statFigure('Moves', 'How many times someone went straight from the first area to the second that day.'),
  updated_at: computedAt(),
};

/**
 * Moves between two areas per facility day (`itap.area_transitions_daily`): consecutive areas of one
 * visit, written by the hourly aggregation. Read only; narrowed by the sidebar facility. The flow
 * matrix of the Analytics page sums them over a period; abnormal-movement rules compare against them.
 */
export const areaTransition = defineResource(AREA_TRANSITION_RESOURCE, {
  texts: {
    label: 'Area move count',
    labelPlural: 'Moves between areas',
    doc: {
      summary:
        'How many times people went from one area straight to another on one day of a facility; the basis of the flow matrix and of abnormal-movement alerts.',
    },
  },
  basePath: '/area-moves',
  section: NAV_SECTIONS.analytics,
  order: 30,
  icon: NAV_ICONS.areaTransitions,
  displayField: 'day',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: areaTransitionFields,
  views: {
    list: {
      columns: ['day', 'from_area_id', 'to_area_id', 'count', 'facility_id'],
      defaultSort: [{ field: 'day', direction: 'desc' }],
      sortTiebreaker: 'id',
      pageSize: 50,
      filters: { pinned: ['from_area_id', 'to_area_id'], fields: ['from_area_id', 'to_area_id', 'facility_id', 'day', 'count'] },
    },
    show: {
      header: (l) => [l.grid(['day', 'facility_id'])],
      body: (l) => [l.grid(['from_area_id', 'to_area_id', 'count']), 'updated_at'],
    },
  },
});
