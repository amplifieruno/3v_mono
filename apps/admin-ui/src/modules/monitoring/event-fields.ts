import { f } from '@burojs/field-types';
import {
  DETECTION_RESOURCE,
  DEVICE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
  TRACKING_SESSION_RESOURCE,
} from '../../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, EVENT_TYPE_ENUM } from '../../enums/events';
import { EVENT_TYPES } from '../../enums/event-types';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import {
  accessPointRelation,
  areaRelation,
  facilityRelation,
  identityRelation,
  platformRelation,
  profileRelation,
} from './place-fields';

const shown = ['list', 'show'] as const;

/** A severity written by the platform (events, incidents); ordered: info < low < medium < high < critical. */
export const severityField = (summary: string) =>
  enumField(EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Severity', doc: { summary } },
  });

/** A reference to a record of a later phase (access decision, authentication attempt): its id, shown only. */
const recordId = (label: string, summary: string) =>
  f.uuid({ system: true, nullable: true, in: ['show'], texts: { label, doc: { summary } } });

/** Columns of `itap.events` the `org_admin` role reads; all written by the platform. */
export const eventFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  occurred_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'When', doc: { summary: 'When it happened (the detection, decision or check time), not when it was stored.' } },
  }),
  severity: severityField(
    'How urgent the event is: the type’s own severity, raised by a published event rule that matched it.',
  ),
  event_type: enumField(EVENT_TYPES, EVENT_TYPE_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Event', doc: { summary: 'What happened; each type has one producer in the platform.' } },
  }),
  title: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Title', doc: { summary: 'The platform’s one-line description, with the place or person.' } },
  }),
  facility_id: facilityRelation('The facility it happened in; empty for an organization-wide event.'),
  area_id: areaRelation('The area it happened in, when it is tied to one.'),
  access_point_id: accessPointRelation('The door, gate or turnstile it happened at.', ['show']),
  device_id: platformRelation(DEVICE_RESOURCE, 'device', {
    label: 'Device',
    summary: 'The camera, reader or terminal that saw it, or the device it is about.',
  }),
  identity_id: identityRelation('The identity it concerns (for a person never linked to a profile, the only link).'),
  profile_id: profileRelation('The person it concerns, when the identity was linked to one at the time.'),
  rule_version_id: platformRelation(EVENT_RULE_VERSION_RESOURCE, 'rule_version', {
    label: 'Rule version',
    summary:
      'The published event rule version that set the severity (the most severe one when several matched); empty when no rule matched.',
  }),
  session_id: platformRelation(
    TRACKING_SESSION_RESOURCE,
    null,
    { label: 'Session', summary: 'The tracking session (the stay in the facility) it happened in.' },
    ['show'],
  ),
  detection_id: platformRelation(
    DETECTION_RESOURCE,
    null,
    { label: 'Detection', summary: 'The face detection that raised it.' },
    ['show'],
  ),
  access_decision_id: recordId('Access decision', 'The access decision that raised it (the access log comes in a later phase).'),
  authentication_attempt_id: recordId(
    'Authentication attempt',
    'The face sign-in attempt that raised it (the face authentication log comes in a later phase).',
  ),
  payload: f.json({
    system: true,
    in: ['show'],
    texts: {
      label: 'Details',
      doc: {
        summary:
          'Machine-readable facts of the event as they were then, such as the threshold, the matched rule versions or the watch list.',
      },
    },
  }),
  dedup_key: f.string({
    system: true,
    in: ['show'],
    texts: {
      label: 'Deduplication key',
      doc: {
        summary:
          'The state the event stands for (session, type and area, or a time bucket): the same state never raises a second event.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};
