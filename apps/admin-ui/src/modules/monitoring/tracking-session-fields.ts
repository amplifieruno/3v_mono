import { f } from '@burojs/field-types';
import { VISIT_RESOURCE } from '../../data/resource-names';
import { TRACKING_SESSION_STATUSES, TRACKING_SESSION_STATUS_ENUM } from '../../enums/monitoring';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { accessPointRelation, areaRelation, facilityRelation, identityRelation, profileRelation } from './place-fields';

const shown = ['list', 'show'] as const;

/** Columns of `itap.tracking_sessions` the `org_admin` role reads; all written by the tracking pipeline. */
export const trackingSessionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  identity_id: identityRelation('The identity tracked: the face the cameras followed.'),
  profile_id: profileRelation(
    'The person the identity belonged to when the session opened; a later link or unlink does not rewrite it.',
  ),
  facility_id: facilityRelation('The facility the person was in.'),
  status: enumField(TRACKING_SESSION_STATUSES, TRACKING_SESSION_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Active while cameras keep seeing the person; completed when they were last seen at an exit, lost when no camera saw them for the tracking timeout anywhere else.',
      },
    },
  }),
  started_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Arrived', doc: { summary: 'The first detection of the person in the facility for this session.' } },
  }),
  last_detected_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Last seen', doc: { summary: 'The latest detection of the person in this session.' } },
  }),
  ended_at: dateTime({
    system: true,
    in: [...shown],
    texts: {
      label: 'Ended',
      doc: { summary: 'When the session was closed: the last detection, found by the next detection or the stale-session job.' },
    },
  }),
  duration_seconds: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Duration (s)', doc: { summary: 'From arrival to the end, in seconds; empty while the session is active.' } },
  }),
  last_area_id: areaRelation('The area the person was last seen in.', [...shown], 'last_area', 'Last area'),
  last_access_point_id: accessPointRelation(
    'The door of the latest detection, when its camera watches one: an exit there closes the session as completed.',
    ['show'],
    'last_access_point',
    'Last access point',
  ),
  visit_id: f.relation({
    to: VISIT_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'page',
    providerOptions: { relationship: 'visit' },
    texts: {
      label: 'Visit',
      doc: { summary: 'The visit of that day the session belongs to, when the person is a visitor expected or checked in.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
