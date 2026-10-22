import { defineResource, ref, relatedList, source } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { enumField } from '../../enums/field';
import {
  AREA_ACCESS_LEVELS,
  AREA_ACCESS_LEVEL_ENUM,
  AREA_STATUSES,
  AREA_STATUS_ENUM,
  AREA_TYPES,
  AREA_TYPE_ENUM,
} from '../../enums/places';
import { floorPlanBlock } from '../../blocks/floor-plan/floor-plan-block';
import { resourceByName } from '../../data/resource-by-name';
import { areaShape } from '../../fields/area-shape';
import { rangeValidator } from '../../fields/bounded-number';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { AREA_RESOURCE, FACILITY_RESOURCE, FLOOR_PLAN_RESOURCE } from '../../data/resource-names';

/**
 * Columns of `itap.areas` (and its computed `current_occupancy`) the `org_admin` role reads;
 * the module's `index.ts` mapping selects these.
 */
export const areaFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    // Inserted with the area, never updated (`org_admin` may not update `facility_id`).
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      doc: { summary: 'The site the area belongs to; fixed once the area exists.' },
    },
  }),
  parent_id: f.relation({
    // By name: a typed self-relation would make the field map's type refer to itself.
    to: 'area',
    nullable: true,
    open: 'page',
    // Only areas of the same facility can be a parent (the database's parent key carries the
    // facility); with no facility chosen yet the select asks for one first.
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }],
    texts: {
      label: 'Inside',
      description: 'The area this one belongs to; empty for a top-level area such as a building.',
      doc: {
        summary:
          'The enclosing area (a room inside a floor, a floor inside a building). Moving an area moves its whole subtree; an area cannot be placed inside itself or one of its own sub-areas.',
      },
    },
  }),
  name: f.string({ required: true, texts: 'Name' }),
  area_type: enumField(AREA_TYPES, AREA_TYPE_ENUM, {
    required: true,
    default: 'zone',
    texts: {
      label: 'Type',
      doc: {
        summary:
          'What kind of place the area is. A floor carries the floor plan its sub-areas are drawn on; a virtual zone is a geofence not tied to walls.',
      },
    },
  }),
  access_level: enumField(AREA_ACCESS_LEVELS, AREA_ACCESS_LEVEL_ENUM, {
    required: true,
    default: 'public',
    texts: {
      label: 'Access level',
      doc: {
        summary:
          'How protected the area is. Where no access policy governs the area, a person whose profile clearance is below this level raises a restricted-area event on entry.',
      },
    },
  }),
  status: enumField(AREA_STATUSES, AREA_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Whether the area is in use. An area with sub-areas, devices or access points cannot be deleted; set it inactive instead.',
      },
    },
  }),
  description: f.text({ nullable: true, texts: 'Description' }),
  capacity: f.number({
    nullable: true,
    integer: true,
    validate: rangeValidator({ min: 0, integer: true }),
    texts: {
      label: 'Capacity',
      doc: {
        summary:
          'How many people the area holds. When more people are inside (sub-areas included), an occupancy-exceeded event is raised. Empty means no limit.',
      },
    },
  }),
  loitering_threshold_seconds: f.number({
    nullable: true,
    integer: true,
    validate: rangeValidator({ min: 1, integer: true }),
    texts: {
      label: 'Loitering after (seconds)',
      doc: {
        summary:
          'A person who stays in the area this long raises a loitering event (checked every minute). Empty means no loitering check for this area.',
      },
    },
  }),
  shape: areaShape({
    areaField: 'parent_id',
    selfIsArea: true,
    texts: {
      label: 'Shape',
      description: 'Drawn on the floor plan of this area, or of the nearest area it lies inside.',
      doc: {
        summary:
          'The area’s outline on its floor plan, a polygon or a circle in the plan’s pixels, shown on the floor plan with the area’s occupancy; a virtual zone (a geofence) is only its shape. An area with a floor plan of its own is drawn on that plan, any other area on the plan of the nearest area it lies inside. The whole shape must lie on the plan image. Drawing needs a mouse, pen or touch; points cannot be typed in yet.',
      },
    },
  }),
  path: f.json({
    system: true,
    in: [],
    texts: {
      label: 'Path',
      doc: { summary: 'The ids from the top-level area down to this one, kept by the database.' },
    },
  }),
  depth: f.number({
    system: true,
    in: ['show'],
    texts: {
      label: 'Depth',
      doc: { summary: 'How deep the area sits in the tree: 0 for a top-level area, 1 for its sub-areas.' },
    },
  }),
  current_occupancy: f.number({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Inside now',
      doc: {
        summary:
          'People the tracker currently places in the area or any of its sub-areas; each person counts once.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Areas: the tree of floors, zones and rooms of each facility. The sidebar facility picker
 * narrows the list to one facility (`data.scope`); the facility page shows the whole tree.
 */
export const area = defineResource(AREA_RESOURCE, {
  texts: {
    label: 'Area',
    labelPlural: 'Areas',
    doc: {
      summary:
        'A part of a facility (building, floor, zone, room, entrance, parking, or a virtual geofence) placed in the facility’s area tree, with its access level, capacity and loitering threshold.',
    },
  },
  basePath: '/areas',
  section: NAV_SECTIONS.places,
  order: 20,
  icon: NAV_ICONS.areas,
  displayField: 'name',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  prefill: { fromQuery: ['facility_id', 'parent_id'] },
  fields: areaFields,
  views: {
    list: {
      columns: [
        'name',
        'area_type',
        'facility_id',
        'parent_id',
        'access_level',
        'status',
        'capacity',
        'current_occupancy',
      ],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name'] },
      filters: { fields: ['area_type', 'access_level', 'status', 'facility_id'] },
    },
    show: {
      with: {
        // The plan this area carries itself (a floor, a parking level), if any.
        plan: source.list(resourceByName(FLOOR_PLAN_RESOURCE), {
          where: [{ field: 'area_id', op: 'eq', value: ref('record', 'id') }],
          limit: 1,
          count: true,
        }),
      },
      header: (l) => [l.grid(['area_type', 'access_level', 'status'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['name', 'facility_id', 'parent_id']),
                l.grid(['capacity', 'current_occupancy', 'loitering_threshold_seconds']),
                'description',
                'shape',
                l.grid(['depth', 'created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [l.place(floorPlanBlock, { key: 'floor-plan', props: { areaId: l.ref('record', 'id') } })],
              {
                key: 'floor_plan',
                texts: 'Floor plan',
                when: l.compare(l.ref('plan', 'total'), 'gt', 0),
              },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(AREA_RESOURCE)), {
                  key: 'sub-areas',
                  props: {
                    where: [{ field: 'parent_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['name', 'area_type', 'access_level', 'status', 'capacity', 'current_occupancy'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'sub_areas', texts: 'Sub-areas' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['facility_id', 'parent_id']),
        l.place(areaParentGuardBlock, { key: 'parent-guard' }),
        l.grid(['name', 'area_type']),
        l.grid(['access_level', 'status']),
        l.grid(['capacity', 'loitering_threshold_seconds']),
        'description',
        'shape',
      ],
    },
  },
});
