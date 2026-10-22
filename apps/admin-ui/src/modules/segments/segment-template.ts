import { type Check, type Rule, defineResource, ref, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { SEGMENT_RESOURCE, SEGMENT_TEMPLATE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { SEGMENT_TARGETS, SEGMENT_TARGET_ENUM } from '../../enums/segments';
import { checkNotBlank } from '../../fields/not-blank';
import { segmentConditions } from '../../fields/segment-conditions';
import { conditionsEmpty } from './segment-checks';
import { CONDITIONS_SUMMARY } from './segment-fields';
import { createSegmentFromTemplate } from './segment-ops';
import { SEGMENT_COLUMNS } from './segment';

/** Columns of `itap.segment_templates` the `org_admin` role reads; system rows are read only. */
export const segmentTemplateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'Unique among the organization’s templates.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  target: enumField(SEGMENT_TARGETS, SEGMENT_TARGET_ENUM, {
    required: true,
    default: 'profiles',
    write: 'create',
    texts: {
      label: 'Members are',
      doc: { summary: 'Profiles or identities: the target of the segments created from it. Fixed once the template exists.' },
    },
  }),
  category: f.string({
    nullable: true,
    texts: { label: 'Category', doc: { summary: 'A free grouping of templates, such as behavior, lifecycle or schedule.' } },
  }),
  conditions: segmentConditions({
    targetField: 'target',
    in: ['show', 'create', 'edit'],
    texts: { label: 'Conditions', doc: { summary: `Copied into each segment created from the template. ${CONDITIONS_SUMMARY}` } },
  }),
  is_system: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Built in', doc: { summary: 'Templates that come with the platform: read only, but segments can be created from them.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

const isSystem = (ctx: { readonly record?: unknown }) =>
  (ctx.record as { readonly is_system?: unknown } | undefined)?.is_system === true;

/** Built-in templates are read only (the update and delete permissions filter `is_system = false`). */
const TEMPLATE_RULES: Rule[] = (['edit', 'delete'] as const).map((name) => ({
  target: { kind: 'action', name },
  deny: 'run',
  when: isSystem,
  fallback: 'disable',
  reason: 'A built-in template is read only: create a segment from it and change the segment’s conditions.',
}));

/** A template's conditions are what it is for: never empty. */
const TEMPLATE_CHECKS: Check[] = [
  {
    id: 'templateConditions',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'conditions',
    texts: 'A template needs conditions: who the segments created from it hold.',
    when: ({ values }) => conditionsEmpty(values.conditions),
  },
];

/**
 * Segment templates (`itap.segment_templates`): ready-made conditions, built in or the
 * organization's own. "Create segment" starts a dynamic segment with the template's target and a
 * copy of its conditions; later changes to the template do not reach the segment.
 */
export const segmentTemplate = defineResource(SEGMENT_TEMPLATE_RESOURCE, {
  texts: {
    label: 'Segment template',
    labelPlural: 'Segment templates',
    doc: {
      summary:
        'Ready-made conditions for dynamic segments, built in (read only) or the organization’s own: a segment created from one starts with a copy of them.',
    },
  },
  basePath: '/segment-templates',
  section: NAV_SECTIONS.people,
  order: 45,
  icon: NAV_ICONS.segmentTemplates,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: segmentTemplateFields,
  rules: TEMPLATE_RULES,
  checks: TEMPLATE_CHECKS,
  actions: (r) => ({
    item: [
      r.action.flow('create_segment', {
        texts: {
          label: 'Create segment',
          notify: 'Segment created',
          doc: {
            summary:
              'Creates a dynamic segment with this template’s target and a copy of its conditions, under a name of its own. It is evaluated within a minute or two.',
          },
        },
        icon: NAV_ICONS.createFromTemplate,
        surfaces: { default: 'menu', row: 'auto', show: 'auto' },
        form: {
          fields: {
            name: f.string({ required: true, validate: checkNotBlank(), texts: { label: 'Segment name', doc: { summary: 'Unique among the organization’s segments.' } } }),
            description: f.text({ nullable: true, texts: 'Description' }),
          },
        },
        submit: {
          mutation: createSegmentFromTemplate,
          retry: 'never',
          input: ({ values, record, fresh }) => {
            const template = fresh ?? record ?? {};
            const typed = typeof values.description === 'string' && values.description.trim() !== '';
            return {
              templateId: template.id,
              target: template.target,
              conditions: template.conditions,
              name: values.name,
              description: typed ? values.description : (template.description ?? null),
            };
          },
        },
        then: { notify: true, open: { resource: SEGMENT_RESOURCE, id: ref('result', 'id') } },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['name', 'target', 'category', 'is_system'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { pinned: ['target', 'is_system'], fields: ['target', 'category', 'is_system'] },
      savedViews: [
        { id: 'built-in', texts: 'Built in', state: { filters: [{ field: 'is_system', op: 'eq', value: true }] } },
        { id: 'own', texts: 'Our own', state: { filters: [{ field: 'is_system', op: 'eq', value: false }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['target', 'category', 'is_system'])],
      body: (l) => [
        'name',
        'description',
        'conditions',
        l.tabs(
          [
            l.panel(
              [
                l.place(relatedList(resourceByName(SEGMENT_RESOURCE)), {
                  key: 'template-segments',
                  props: {
                    where: [{ field: 'template_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...SEGMENT_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'segments', texts: 'Segments created from it' },
            ),
          ],
          { key: 'sections' },
        ),
        l.grid(['created_at', 'updated_at']),
      ],
    },
    create: { body: (l) => ['name', 'description', l.grid(['target', 'category']), 'conditions'] },
    edit: { header: (l) => [l.grid(['target'])], body: () => ['name', 'description', 'category', 'conditions'] },
  },
});
