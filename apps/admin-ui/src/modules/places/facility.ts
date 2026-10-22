import { defineResource, facts, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POINT_RESOURCE, EVENT_RESOURCE, FACILITY_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { FACILITY_STATUSES, FACILITY_STATUS_ENUM } from '../../enums/places';
import { rangeValidator } from '../../fields/bounded-number';
import { customFields } from '../../fields/custom-fields';
import { type FieldProblem, problemValidator } from '../../fields/field-issue';
import { timeWindows } from '../../fields/time-windows';
import { timezone } from '../../fields/timezone';
import { applyTemplateFlow } from './apply-template-flow';
import { areaTreeBlock } from './area-tree-block';
import { FACILITY_OCCUPANCY_ROWS, facilityOccupancyNow } from './occupancy';

/** `facilities_contact_is_object`: the contact details are a JSON object (`{}` for none). */
export const contactProblem = (value: unknown): FieldProblem | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? null
    : {
        code: 'facility.contactNotObject',
        text: 'Enter a JSON object, such as {"phone": "+7 495 000-00-00", "email": "desk@example.com"}, or {} for none.',
      };

export const checkContact = problemValidator(contactProblem);

/** Columns of `itap.facilities` (and its two computed fields) the `org_admin` role reads; the module's `index.ts` mapping selects these. */
export const facilityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    generated: 'always',
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Code',
      doc: {
        summary:
          'Reference assigned by the system when the facility is created (`FACILITY-00001`), unique within the organization and never reused.',
      },
    },
  }),
  name: f.string({
    required: true,
    texts: {
      label: 'Name',
      doc: { summary: 'Unique within the organization; shown in the facility picker and on every place.' },
    },
  }),
  status: enumField(FACILITY_STATUSES, FACILITY_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Whether the site is in operation. Under maintenance and inactive sites stay visible with their history; set a facility inactive instead of deleting it.',
      },
    },
  }),
  description: f.text({ nullable: true, texts: 'Description' }),
  address: f.text({ nullable: true, texts: 'Address' }),
  latitude: f.number({
    nullable: true,
    validate: rangeValidator({ min: -90, max: 90 }),
    texts: {
      label: 'Latitude',
      doc: { summary: 'Degrees north (positive) or south (negative), from −90 to 90; for maps.' },
    },
  }),
  longitude: f.number({
    nullable: true,
    validate: rangeValidator({ min: -180, max: 180 }),
    texts: {
      label: 'Longitude',
      doc: { summary: 'Degrees east (positive) or west (negative), from −180 to 180; for maps.' },
    },
  }),
  timezone: timezone({
    required: true,
    default: 'UTC',
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'IANA zone (for example `Europe/Moscow`) in which the facility’s operating hours, schedules and daily statistics are evaluated.',
      },
    },
  }),
  operating_hours: timeWindows({
    // `[]` is always open: `itap.evaluate_detection` skips the after-hours check.
    emptyText: 'Always open',
    texts: {
      label: 'Operating hours',
      description:
        'Days and hours the site is open, in its time zone. A window whose end is before its start ends the next day.',
      doc: {
        summary:
          'The weekly hours the site is open, read in its time zone. Presence outside them raises after-hours events (people inside their own work schedule excepted). No windows means always open: no after-hours events.',
      },
    },
  }),
  contact: f.json({
    default: {},
    validate: checkContact,
    texts: {
      label: 'Contact',
      description: 'A JSON object, such as {"phone": "…", "email": "…", "person": "…"}.',
      doc: {
        summary:
          'Free-form contact details of the site (phone, email, the person or desk to call) as a JSON object; shown to operators, not used by rules.',
      },
    },
  }),
  custom_fields: customFields({
    entity: 'facility',
    texts: {
      label: 'Custom attributes',
      doc: {
        summary:
          'Values of the organization’s own facility attributes (Organization → Custom attributes). Required attributes must be filled whenever these values are saved; values of inactive or deleted attributes are kept.',
      },
    },
  }),
  areas_count: f.number({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Areas',
      doc: { summary: 'How many areas (floors, zones, rooms, at any depth) the facility has.' },
    },
  }),
  current_occupancy: f.number({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'On site now',
      doc: {
        summary:
          'People currently placed in an area of the facility, as the tracker last placed them; each person counts once (a person is in one area of a facility at a time).',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Facilities: the organization's physical sites. Areas, floor plans, access points and
 * devices belong to one; the sidebar facility picker narrows those lists to it. A
 * facility with areas or devices cannot be deleted (set it inactive instead).
 */
export const facility = defineResource(FACILITY_RESOURCE, {
  texts: {
    label: 'Facility',
    labelPlural: 'Facilities',
    doc: {
      summary:
        'A physical site of the organization, such as a building or campus, with its time zone and operating hours. Areas, devices and access points belong to one facility.',
    },
  },
  basePath: '/facilities',
  section: NAV_SECTIONS.places,
  order: 10,
  icon: NAV_ICONS.facilities,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: facilityFields,
  actions: (r) => ({ item: [r.action.flow('apply_template', applyTemplateFlow)] }),
  views: {
    list: {
      columns: ['code', 'name', 'status', 'timezone', 'areas_count', 'current_occupancy'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name', 'code', 'address'] },
      filters: { fields: ['status'] },
    },
    show: {
      header: (l) => [
        'code',
        'status',
        l.place(facts, {
          key: 'occupancy',
          props: {
            query: facilityOccupancyNow,
            input: { facilityId: l.ref('record', 'id') },
            rows: [...FACILITY_OCCUPANCY_ROWS],
            view: 'grid',
          },
        }),
      ],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['name', 'timezone', 'address', 'latitude', 'longitude']),
                'description',
                'operating_hours',
                'contact',
                'custom_fields',
                l.grid(['areas_count', 'current_occupancy', 'created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel([l.place(areaTreeBlock, { key: 'area-tree' })], {
              key: 'areas',
              texts: 'Areas',
            }),
            l.panel(
              [
                l.place(relatedList(resourceByName(ACCESS_POINT_RESOURCE)), {
                  key: 'access-points-list',
                  props: {
                    where: [{ field: 'facility_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['name', 'kind', 'area_id', 'from_area_id', 'direction', 'is_entry_exit', 'status'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'access_points', texts: 'Access points' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EVENT_RESOURCE)), {
                  key: 'facility-events',
                  props: {
                    where: [{ field: 'facility_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['occurred_at', 'severity', 'event_type', 'title', 'area_id', 'profile_id'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'events', texts: 'Events' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['name', 'status', 'timezone']),
        'address',
        l.grid(['latitude', 'longitude']),
        'description',
        'operating_hours',
        'contact',
        'custom_fields',
      ],
    },
  },
});
