import { defineResource, ref, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { enumField } from '../../enums/field';
import {
  ACCESS_POINT_DIRECTIONS,
  ACCESS_POINT_DIRECTION_ENUM,
  ACCESS_POINT_KINDS,
  ACCESS_POINT_KIND_ENUM,
  AREA_STATUSES,
  AREA_STATUS_ENUM,
} from '../../enums/places';
import { planPosition } from '../../fields/plan-position';
import { ACCESS_POINT_DEVICE_RESOURCE, ACCESS_POINT_RESOURCE, AREA_RESOURCE, FACILITY_RESOURCE } from '../../data/resource-names';

/** `access_points_areas_differ`: an access point does not lead from an area into the same area. */
export const checkFromArea = (value: unknown, ctx: { readonly values: Readonly<Record<string, unknown>> }) =>
  value !== null && value !== undefined && value !== '' && value === ctx.values.area_id
    ? 'Choose another area than the one it leads into, or none.'
    : null;

const sameFacility = [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }] as const;

/**
 * Columns of `itap.access_points` the `org_admin` role reads; the module's `index.ts` mapping
 * selects these.
 */
export const accessPointFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    // `org_admin` may not update `facility_id`.
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      doc: { summary: 'The site the access point belongs to; fixed once it exists.' },
    },
  }),
  name: f.string({ required: true, texts: 'Name' }),
  kind: enumField(ACCESS_POINT_KINDS, ACCESS_POINT_KIND_ENUM, {
    required: true,
    default: 'door',
    texts: {
      label: 'Kind',
      doc: { summary: 'What the passage is (door, turnstile, gate, elevator, reception desk); its icon on the floor plan.' },
    },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    required: true,
    open: 'page',
    candidates: [...sameFacility],
    texts: {
      label: 'Leads into',
      description: 'The area a person is in after passing through.',
      doc: {
        summary:
          'The area on the far side of the passage: a person seen passing it is placed in this area. Its floor plan (or the nearest enclosing area’s) is where the access point is positioned.',
      },
    },
  }),
  from_area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    open: 'page',
    candidates: [...sameFacility],
    validate: checkFromArea,
    texts: {
      label: 'Leads from',
      description: 'The area on the near side; empty for the outside of the facility.',
      doc: {
        summary:
          'The area a person leaves when passing in the entry direction; empty when the passage leads in from outside. It must differ from the area it leads into.',
      },
    },
  }),
  direction: enumField(ACCESS_POINT_DIRECTIONS, ACCESS_POINT_DIRECTION_ENUM, {
    required: true,
    default: 'both',
    texts: {
      label: 'Direction',
      doc: { summary: 'Which way people may pass: entry only, exit only, or both.' },
    },
  }),
  position: planPosition({
    areaField: 'area_id',
    texts: {
      label: 'Position',
      description: 'Click on the floor plan of the area it leads into.',
      doc: {
        summary:
          'Where the access point is drawn, a point in the pixels of the floor plan of the area it leads into (or of the nearest enclosing area with a plan). Empty means not drawn on any plan.',
      },
    },
  }),
  is_entry_exit: f.boolean({
    default: false,
    texts: {
      label: 'Facility entry/exit',
      doc: {
        summary:
          'Marks a way in or out of the whole facility. A visitor seen leaving through one ends their visit; occupancy counts people out through these.',
      },
    },
  }),
  face_credential: f.boolean({
    default: false,
    texts: {
      label: 'Face credential',
      doc: {
        summary:
          'The door opens on a recognised face: a camera bound to it decides access by the access policies (with a short cooldown per person) and the decision is logged. Needs a camera among its devices.',
      },
    },
  }),
  status: enumField(AREA_STATUSES, AREA_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: { summary: 'Whether the passage is in use; set it inactive instead of deleting it to keep its history.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Access points: the doors, turnstiles, gates, elevators and reception desks of each facility,
 * between two areas, with their position on the floor plan and the devices bound to them. The
 * sidebar facility picker narrows the list (`data.scope`).
 */
export const accessPoint = defineResource(ACCESS_POINT_RESOURCE, {
  texts: {
    label: 'Access point',
    labelPlural: 'Access points',
    doc: {
      summary:
        'A passage between two areas of a facility (a door, turnstile, gate, elevator or reception desk) where people are seen entering or leaving and where access is decided.',
    },
  },
  basePath: '/access-points',
  section: NAV_SECTIONS.places,
  order: 40,
  icon: NAV_ICONS.accessPoints,
  displayField: 'name',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  prefill: { fromQuery: ['facility_id', 'area_id'] },
  fields: accessPointFields,
  views: {
    list: {
      columns: ['name', 'kind', 'facility_id', 'area_id', 'from_area_id', 'direction', 'is_entry_exit', 'status'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name'] },
      filters: { fields: ['kind', 'direction', 'status', 'is_entry_exit', 'face_credential', 'facility_id'] },
    },
    show: {
      header: (l) => [l.grid(['kind', 'direction', 'status'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['name', 'facility_id']),
                l.grid(['from_area_id', 'area_id']),
                l.grid(['is_entry_exit', 'face_credential']),
                'position',
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(ACCESS_POINT_DEVICE_RESOURCE)), {
                  key: 'bound-devices',
                  props: {
                    // Both keys seed "+ Create": a binding carries its access point's facility.
                    where: [
                      { field: 'access_point_id', op: 'eq', value: l.ref('record', 'id') },
                      { field: 'facility_id', op: 'eq', value: l.ref('record', 'facility_id') },
                    ],
                    columns: ['device_id', 'role', 'created_at'],
                    open: 'none',
                  },
                }),
              ],
              { key: 'devices', texts: 'Devices' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['facility_id', 'name']),
        l.grid(['kind', 'direction', 'status']),
        l.grid(['from_area_id', 'area_id']),
        l.grid(['is_entry_exit', 'face_credential']),
        'position',
      ],
    },
  },
});
