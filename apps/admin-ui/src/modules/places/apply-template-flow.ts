import { type FlowConfig, type Layout, type ScreenRef, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { applyFacilityTemplate } from './apply-template';
import { templateOverlapBlock } from './template-overlap-block';
import { AREA_RESOURCE, FACILITY_TEMPLATE_RESOURCE } from '../../data/resource-names';

/** The form of {@link applyTemplateFlow}. */
const applyTemplateFields = {
  template_id: f.relation({
    to: FACILITY_TEMPLATE_RESOURCE,
    required: true,
    texts: { label: 'Template', doc: { summary: 'The facility template whose areas are created.' } },
  }),
  parent_area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('record', 'id') }],
    texts: {
      label: 'Inside',
      description: 'The area to create them in (such as a floor); empty for the top level.',
      doc: {
        summary:
          'The area of this facility the template’s top-level areas are created in; empty creates them at the facility’s top level.',
      },
    },
  }),
};

/**
 * The facility's item flow "Apply template": pick a template and, optionally, the area to
 * create it in; the form previews the template and warns about names already there
 * (`itap:template-overlap`); the notification gives what the server created.
 */
export const applyTemplateFlow = {
  texts: {
    label: 'Apply template',
    notify: 'Template applied: {{created}} areas created ({{topLevel}} at the top: {{names}}).',
    doc: {
      summary:
        'Creates the areas of a facility template in this facility, at the top level or inside a chosen area, in one step. Every area is created, even where one of the same name exists.',
    },
  },
  icon: NAV_ICONS.applyTemplate,
  surfaces: { default: false, show: 'auto' },
  form: {
    fields: applyTemplateFields,
    // Empty, not absent, until chosen: the preview block's props read these values.
    initial: {
      template_id: { kind: 'literal', value: null },
      parent_area_id: { kind: 'literal', value: null },
    },
    body: (l: Layout<typeof applyTemplateFields>) => [
      'template_id',
      'parent_area_id',
      l.place(templateOverlapBlock, {
        key: 'template-overlap',
        // A flow form reads the flow's record, but its layout is typed as a create screen
        // without one (`tasks/ui/buro-gaps.md` G20).
        props: { facilityId: ref('record', 'id') as unknown as ScreenRef<'record'> },
      }),
    ],
  },
  submit: {
    mutation: applyFacilityTemplate,
    // Not replay-safe: a second call creates every area again.
    retry: 'never',
    input: {
      templateId: ref('values', 'template_id'),
      facilityId: ref('record', 'id'),
      // Empty: the facility's top level.
      parentAreaId: ref('values', 'parent_area_id'),
    },
  },
  then: {
    notify: {
      params: {
        created: ref('result', 'created'),
        topLevel: ref('result', 'top_level'),
        names: ref('result', 'names'),
      },
    },
  },
} satisfies FlowConfig<unknown, Record<never, never>, typeof applyTemplateFields>;
