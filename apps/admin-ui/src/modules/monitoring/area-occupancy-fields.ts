import { f } from '@burojs/field-types';
import { dateTime } from '../../fields/date-time';
import { areaRelation, facilityRelation, identityRelation, sessionRelation } from './place-fields';

const shown = ['list', 'show'] as const;

/** Columns of `itap.area_occupancy` the `org_admin` role reads; all written by the tracking pipeline. */
export const areaOccupancyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  identity_id: identityRelation('The identity placed here now.'),
  area_id: areaRelation('The innermost area the person was last seen in.'),
  facility_id: facilityRelation('The facility of the area.'),
  entered_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Entered', doc: { summary: 'When the person was first seen in this area this time.' } },
  }),
  last_seen_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Last seen', doc: { summary: 'The latest detection of the person in this area.' } },
  }),
  session_id: sessionRelation('The visit to the facility the person is on.', ['show']),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};
