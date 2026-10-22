import { defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { floorPlanBlock } from '../../blocks/floor-plan/floor-plan-block';
import { rangeValidator } from '../../fields/bounded-number';
import { imageSize } from '../../fields/image-size';
import { FLOOR_PLAN_RESOURCE, PLAN_AREA_RESOURCE } from '../../fields/plan-rows';
import { storageFile } from '../../fields/storage-file';
import { FACILITY_RESOURCE } from './resource-names';

export { FLOOR_PLAN_RESOURCE };

/** Largest floor plan image the console uploads. */
const FLOOR_PLAN_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Columns of `itap.floor_plans` the `org_admin` role reads; the module's `index.ts` mapping
 * selects these.
 */
export const floorPlanFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    // `org_admin` may not update `facility_id`.
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      doc: { summary: 'The site the plan belongs to; fixed once the plan exists.' },
    },
  }),
  area_id: f.relation({
    // By name: the area resource places this resource's block on its page.
    to: PLAN_AREA_RESOURCE,
    required: true,
    open: 'page',
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }],
    texts: {
      label: 'Area',
      description: 'The floor (or other area) this plan shows; one plan per area.',
      doc: {
        summary:
          'The area the plan belongs to, usually a floor. Its own shape and the shapes of every area inside it are drawn in this plan’s pixels; an area without a plan of its own uses the plan of its nearest enclosing area. Deleting the area deletes its plan.',
      },
    },
  }),
  name: f.string({ required: true, texts: 'Name' }),
  level: f.number({
    nullable: true,
    integer: true,
    texts: {
      label: 'Level',
      doc: {
        summary: 'The building level: 0 is the ground floor, negative numbers are underground.',
      },
    },
  }),
  image_file_id: storageFile({
    bucket: 'organization',
    kind: 'floor_plan',
    accept: 'image/*',
    maxSize: FLOOR_PLAN_MAX_BYTES,
    texts: {
      label: 'Image',
      doc: {
        summary:
          'The drawing of the floor (PNG, JPEG, SVG, WebP), stored in the organization’s files. The database refuses a file that is not an image.',
      },
    },
  }),
  width_px: imageSize({
    axis: 'width',
    imageField: 'image_file_id',
    texts: {
      label: 'Width (px)',
      doc: {
        summary:
          'The plan’s width in pixels: the space area shapes and positions are drawn in. Taken from the image when empty; changing it later does not move shapes already drawn.',
      },
    },
  }),
  height_px: imageSize({
    axis: 'height',
    imageField: 'image_file_id',
    texts: {
      label: 'Height (px)',
      doc: { summary: 'The plan’s height in pixels; taken from the image when empty.' },
    },
  }),
  scale_m_per_px: f.number({
    nullable: true,
    validate: rangeValidator({ min: 0.000001 }),
    texts: {
      label: 'Scale (m per px)',
      doc: {
        summary:
          'How many metres one pixel of the plan covers (0.05 = 5 cm), used for distances on the plan. Empty when unknown.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Floor plans: an image per floor (or other area) that area shapes, access points and devices
 * are drawn on. The sidebar facility picker narrows the list (`data.scope`).
 */
export const floorPlan = defineResource(FLOOR_PLAN_RESOURCE, {
  texts: {
    label: 'Floor plan',
    labelPlural: 'Floor plans',
    doc: {
      summary:
        'The drawing of a floor (or another area) with its size in pixels and scale; the shapes of the areas inside it, access points and devices are placed on it.',
    },
  },
  basePath: '/floor-plans',
  section: NAV_SECTIONS.places,
  order: 30,
  icon: NAV_ICONS.floorPlans,
  displayField: 'name',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  prefill: { fromQuery: ['facility_id', 'area_id'] },
  fields: floorPlanFields,
  views: {
    list: {
      columns: [
        'name',
        'facility_id',
        'area_id',
        'level',
        'image_file_id',
        'width_px',
        'height_px',
      ],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name'] },
      filters: { fields: ['facility_id'] },
    },
    show: {
      header: (l) => [l.grid(['name', 'facility_id', 'area_id', 'level'])],
      body: (l) => [
        l.place(floorPlanBlock, { key: 'plan', props: { floorPlanId: l.ref('record', 'id') } }),
        l.grid(['width_px', 'height_px', 'scale_m_per_px']),
        l.grid(['image_file_id', 'created_at', 'updated_at']),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['facility_id', 'area_id']),
        l.grid(['name', 'level']),
        'image_file_id',
        l.grid(['width_px', 'height_px', 'scale_m_per_px']),
      ],
    },
  },
});
