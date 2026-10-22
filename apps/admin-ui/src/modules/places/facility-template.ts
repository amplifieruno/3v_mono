import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { templateStructure } from '../../fields/template-structure';
import { FACILITY_TEMPLATE_RESOURCE } from '../../data/resource-names';

/** Columns of `itap.facility_templates` the `org_admin` role reads. */
export const facilityTemplateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    texts: {
      label: 'Name',
      doc: { summary: 'Unique within the organization; shown when choosing a template to apply.' },
    },
  }),
  description: f.text({ nullable: true, texts: 'Description' }),
  structure: templateStructure({
    texts: {
      label: 'Structure',
      description:
        'A JSON list of areas: {"name", "area_type", "access_level"?, "capacity"?, "children"?}.',
      doc: {
        summary:
          'The area tree the template creates, as a JSON list of areas, each with a `name`, an `area_type`, optionally an `access_level` (public when left out) and a `capacity`, and its `children` (areas of the same shape). At most 6 levels and 200 areas.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['list', 'show'] }),
};

/**
 * Facility templates: reusable area trees (a standard office floor, a warehouse) applied to a
 * facility with the facility's "Apply template" action.
 */
export const facilityTemplate = defineResource(FACILITY_TEMPLATE_RESOURCE, {
  texts: {
    label: 'Facility template',
    labelPlural: 'Facility templates',
    doc: {
      summary:
        'A reusable tree of areas (for example a standard office floor) that creates those areas in a facility in one step, for rapid set-up of similar sites.',
    },
  },
  basePath: '/facility-templates',
  section: NAV_SECTIONS.places,
  order: 50,
  icon: NAV_ICONS.facilityTemplates,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: facilityTemplateFields,
  views: {
    list: {
      columns: ['name', 'description', 'updated_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name'] },
    },
    show: {
      body: (l) => ['name', 'description', 'structure', l.grid(['created_at', 'updated_at'])],
    },
    edit: {
      body: () => ['name', 'description', 'structure'],
    },
  },
});
