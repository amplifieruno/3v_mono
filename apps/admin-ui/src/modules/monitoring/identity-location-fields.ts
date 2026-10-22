import { f } from '@burojs/field-types';
import { DETECTION_RESOURCE } from '../../data/resource-names';
import { MOVEMENT_TYPES, MOVEMENT_TYPE_ENUM } from '../../enums/monitoring';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import {
  accessPointRelation,
  areaRelation,
  deviceRelation,
  facilityRelation,
  identityRelation,
  sessionRelation,
} from './place-fields';

const shown = ['list', 'show'] as const;

/** Columns of `itap.identity_locations` the `org_admin` role reads; all written by the tracking pipeline. */
export const identityLocationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  occurred_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'When', doc: { summary: 'The time of the detection that placed the person here.' } },
  }),
  movement_type: enumField(MOVEMENT_TYPES, MOVEMENT_TYPE_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Movement',
      doc: { summary: 'Entry (the first place of a session or a door passed inwards), exit, a move to another area, or an estimated stay.' },
    },
  }),
  identity_id: identityRelation('The identity placed here.'),
  area_id: areaRelation('The area the person entered or moved to.'),
  access_point_id: accessPointRelation('The door passed, when the camera watches one.'),
  device_id: deviceRelation('The camera whose detection placed the person here.'),
  facility_id: facilityRelation('The facility of the place.', ['show']),
  session_id: sessionRelation('The visit to the facility this step belongs to.', ['show']),
  detection_id: f.relation({
    to: DETECTION_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'page',
    texts: { label: 'Detection', doc: { summary: 'The detection that placed the person here.' } },
  }),
  confidence: f.number({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Confidence', doc: { summary: 'How sure the face detector was of the face behind this place, from 0 to 1.' } },
  }),
  is_estimated: f.boolean({
    system: true,
    in: ['show'],
    texts: { label: 'Estimated', doc: { summary: 'An estimated place rather than one a camera saw.' } },
  }),
  position: f.json({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Position', doc: { summary: 'The point on the floor plan, in plan pixels (the camera’s position for a camera detection).' } },
  }),
  uncertainty_m: f.number({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Uncertainty (m)', doc: { summary: 'How far off an estimated position may be, in metres.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};
