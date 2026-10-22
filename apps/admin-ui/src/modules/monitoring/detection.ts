import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { recordDate } from '../people/record-date';
import { DETECTION_RESOURCE } from '../../data/resource-names';
import { detectionFields } from './detection-fields';

/** Page size of the detection lists (busy cameras write several a second). */
export const DETECTION_PAGE_SIZE = 50;

/** The columns of the detection lists, on the list page and on the people's tabs. */
export const DETECTION_COLUMNS = [
  'thumbnail_file_id',
  'detected_at',
  'identity_id',
  'profile_id',
  'device_id',
  'area_id',
  'confidence',
] as const;

/** Saved views of the detection list: who the face was. */
export const DETECTION_SAVED_VIEWS = [
  {
    id: 'known',
    texts: 'Known people',
    state: { filters: [{ field: 'profile_id', op: 'isNotNull' }] },
  },
  {
    id: 'unknown',
    texts: 'Unknown people',
    state: {
      filters: [
        { field: 'identity_id', op: 'isNotNull' },
        { field: 'profile_id', op: 'isNull' },
      ],
    },
  },
  {
    id: 'new-identities',
    texts: 'New identities',
    state: { filters: [{ field: 'is_new_identity', op: 'eq', value: true }] },
  },
  {
    id: 'unidentified',
    texts: 'Unidentified faces',
    state: { filters: [{ field: 'identity_id', op: 'isNull' }] },
  },
];

/**
 * Detections (`itap.detections`): every face a camera recognised, newest first. Written by
 * recognition only, an append-only log: no create, edit or delete, no count on every page
 * (`count: 'manual'`, the mapping's `noAggregate`) and keyset paging. The sidebar facility
 * narrows it (`facility_id`).
 */
export const detection = defineResource(DETECTION_RESOURCE, {
  texts: {
    label: 'Detection',
    labelPlural: 'Detections',
    doc: {
      summary:
        'One face seen by a camera with recognition on: when and where, and whom it was matched to, or the new identity it created.',
    },
  },
  basePath: '/detections',
  section: NAV_SECTIONS.monitoring,
  order: 10,
  icon: NAV_ICONS.detections,
  displayField: 'detected_at',
  recordTitle: (record) => recordDate('Detection at', record.detected_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: detectionFields,
  views: {
    list: {
      columns: [...DETECTION_COLUMNS],
      optionalColumns: ['facility_id', 'is_new_identity'],
      defaultSort: [{ field: 'detected_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: DETECTION_PAGE_SIZE,
      filters: {
        pinned: ['facility_id', 'area_id', 'device_id', 'detected_at'],
        fields: ['facility_id', 'area_id', 'device_id', 'detected_at', 'profile_id', 'identity_id', 'is_new_identity'],
      },
      savedViews: DETECTION_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['detected_at', 'device_id', 'area_id'])],
      body: (l) => [
        l.panel(
          [
            'thumbnail_file_id',
            l.grid(['identity_id', 'profile_id', 'is_new_identity']),
          ],
          { key: 'person', texts: 'Person' },
        ),
        l.panel([l.grid(['facility_id', 'area_id', 'access_point_id'])], { key: 'place', texts: 'Place' }),
        l.panel(
          [l.grid(['confidence', 'similarity', 'quality_score']), l.grid(['frame_width', 'frame_height']), 'bbox'],
          { key: 'recognition', texts: 'Recognition' },
        ),
        'created_at',
      ],
    },
  },
});
