import { f } from '@burojs/field-types';
import { dateTime } from '../../fields/date-time';
import { detectionFace } from '../../fields/detection-face';
import {
  accessPointRelation,
  areaRelation,
  deviceRelation,
  facilityRelation,
  identityRelation,
  profileRelation,
} from './place-fields';

const shown = ['list', 'show'] as const;

/** Columns of `itap.detections` the `org_admin` role reads; all written by recognition. */
export const detectionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  thumbnail_file_id: detectionFace({
    in: [...shown],
    texts: {
      label: 'Face',
      doc: {
        summary:
          'The face crop kept when the face created a new identity; a matched face keeps no crop of its own (the identity’s photos are on its page). "Erased" means the person’s data was erased or anonymized.',
      },
    },
  }),
  detected_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Detected', doc: { summary: 'When the camera saw the face (the time of the analysed frame).' } },
  }),
  identity_id: identityRelation(
    'The identity the face was matched to or created; empty for a face neither matched nor good enough to keep, and for an anonymized detection.',
  ),
  profile_id: profileRelation(
    'The person the identity is linked to now (computed from the identity); empty for an unknown face. An erased person shows as erased.',
    undefined,
    null,
  ),
  person_erased: f.boolean({
    system: true,
    in: [],
    texts: {
      label: 'Person erased',
      doc: { summary: 'The linked person’s data was erased on request: the face shows as erased.' },
    },
  }),
  is_new_identity: f.boolean({
    system: true,
    in: [...shown],
    texts: {
      label: 'New identity',
      doc: { summary: 'The face matched no one and was good enough to become a new (unknown) identity.' },
    },
  }),
  device_id: deviceRelation('The camera that saw the face.'),
  facility_id: facilityRelation('The facility of the camera when it saw the face.'),
  area_id: areaRelation('The area the camera covers: where the person was.'),
  access_point_id: accessPointRelation(
    'The door, gate or turnstile the camera watches, when it is bound to one as its camera.',
    ['show'],
  ),
  confidence: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Confidence',
      doc: { summary: 'How sure the face detector was that this is a face, from 0 to 1.' },
    },
  }),
  similarity: f.number({
    system: true,
    nullable: true,
    in: ['show'],
    texts: {
      label: 'Similarity',
      doc: {
        summary:
          'How close the face was to the matched identity’s face templates, from 0 to 1; empty for a new or unidentified face.',
      },
    },
  }),
  quality_score: f.number({
    system: true,
    nullable: true,
    in: ['show'],
    texts: {
      label: 'Quality',
      doc: { summary: 'The face’s image quality (sharpness, pose, size), from 0 to 1; low-quality faces never create identities.' },
    },
  }),
  bbox: f.json({
    system: true,
    nullable: true,
    in: ['show'],
    texts: {
      label: 'Face box',
      doc: { summary: 'Where the face was in the frame, in frame pixels; cleared when the detection is anonymized.' },
    },
  }),
  frame_width: f.number({ system: true, nullable: true, in: ['show'], texts: 'Frame width (px)' }),
  frame_height: f.number({ system: true, nullable: true, in: ['show'], texts: 'Frame height (px)' }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};
