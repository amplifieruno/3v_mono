import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { AREA_RESOURCE, EMERGENCY_OVERRIDE_AREA_RESOURCE, EMERGENCY_OVERRIDE_RESOURCE, FACILITY_RESOURCE } from '../../data/resource-names';

/** Columns of `itap.emergency_override_areas` the `org_admin` role reads (written with the override only). */
export const emergencyOverrideAreaFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  override_id: f.relation({
    to: EMERGENCY_OVERRIDE_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Override', doc: { summary: 'The emergency override limited to the area.' } },
  }),
  facility_id: f.relation({ to: FACILITY_RESOURCE, system: true, open: 'page', texts: { label: 'Facility', doc: { summary: 'The site of the override and the area.' } } }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Area', doc: { summary: 'The override covers the doors leading into this area and into the areas inside it.' } },
  }),
};

/**
 * The areas an override is limited to (`itap.emergency_override_areas`), read only: written with
 * the override by `start_emergency_override`; none means the whole facility. Listed on the
 * override's page only.
 */
export const emergencyOverrideArea = defineResource(EMERGENCY_OVERRIDE_AREA_RESOURCE, {
  texts: {
    label: 'Override area',
    labelPlural: 'Override areas',
    doc: { summary: 'An area an emergency override is limited to: the doors into it and into the areas inside it.' },
  },
  basePath: '/emergency-override-areas',
  displayField: 'area_id',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: emergencyOverrideAreaFields,
  views: { list: { page: false, columns: ['area_id', 'override_id'] }, show: { page: false } },
});
