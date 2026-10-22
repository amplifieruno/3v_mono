import { defineResource, ref, relatedList } from '@burojs/core';
import type { Layout } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { segmentStatsBlock } from '../../blocks/segment-stats/segment-stats-block';
import { resourceByName } from '../../data/resource-by-name';
import {
  EVENT_RULE_SCOPE_HISTORY_RESOURCE,
  SEGMENT_DAILY_STAT_RESOURCE,
  SEGMENT_RESOURCE,
  SEGMENT_TEMPLATE_RESOURCE,
} from '../../data/resource-names';
import { SEGMENT_CHECKS, segmentDeleted } from './segment-checks';
import { segmentFields } from './segment-fields';
import { ADD_IDENTITIES_FLOW, ADD_PROFILES_FLOW, addIdentitiesFlow, addProfilesFlow, evaluateNowFlow } from './segment-flows';
import { segmentMembersPanel } from './segment-member-tabs';
import { deleteSegment } from './segment-ops';
import { segmentPreviewBlock } from './segment-preview-block';

/** The columns of the segment lists (the list page and a template's Segments tab). */
export const SEGMENT_COLUMNS = ['code', 'name', 'kind', 'target', 'status', 'member_count', 'last_evaluated_at'] as const;

type Fields = typeof segmentFields;

/**
 * What only a dynamic segment has: conditions (a manual one keeps `{}`), and the active window and
 * schedule, which bound its rule members (a manual segment has none, so they would change nothing).
 * A form writes only the fields it shows; a form (`preview`) also offers the preview of who the
 * conditions on screen match (the target is the form's on create, the record's on edit).
 */
const definition = (l: Layout<Fields>, source: 'values' | 'record', preview = false) => {
  const when = l.equals(l.ref(source, 'kind'), 'dynamic');
  // The block reads the form's conditions (and, on create, its target) through its prop defaults.
  const previewBlock = l.place(segmentPreviewBlock, {
    key: 'segment-preview',
    when,
    props: source === 'record' ? { target: l.ref('record', 'target') } : {},
  });
  return [
    l.field('conditions', { when }),
    ...(preview ? [previewBlock] : []),
    l.grid([l.field('active_from', { when }), l.field('active_until', { when })]),
    l.field('schedule', { when }),
  ] as const;
};

/**
 * Segments (`itap.segments`): logical groups of profiles or identities. A manual segment's
 * members are added by hand; a dynamic one's are whoever matches its conditions, evaluated by the
 * server (hourly, and shortly after the inputs change), within its active window and schedule.
 * Event rules, notification rules, access policies and reports name segments; one that is named
 * or has history is archived, not deleted (the database says why).
 */
export const segment = defineResource(SEGMENT_RESOURCE, {
  texts: {
    label: 'Segment',
    labelPlural: 'Segments',
    doc: {
      summary:
        'A group of people or faces, kept by hand (manual) or by conditions the server evaluates (dynamic), that rules, policies and reports can single out.',
    },
  },
  basePath: '/segments',
  section: NAV_SECTIONS.people,
  order: 40,
  icon: NAV_ICONS.segments,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: segmentFields,
  checks: SEGMENT_CHECKS,
  actions: (r) => ({
    resource: [
      r.action.link(
        'from_template',
        { to: { resource: SEGMENT_TEMPLATE_RESOURCE, action: 'list' } },
        {
          texts: {
            label: 'Create from template',
            doc: { summary: 'Opens the segment templates: pick one and create a dynamic segment with its conditions.' },
          },
          icon: NAV_ICONS.createFromTemplate,
          surfaces: { list: 'regular' },
        },
      ),
    ],
    item: [
      r.action.flow('evaluate_now', evaluateNowFlow),
      r.action.flow(ADD_PROFILES_FLOW, addProfilesFlow),
      r.action.flow(ADD_IDENTITIES_FLOW, addIdentitiesFlow),
      // Replaces the built-in Delete: the refusals of the guard and the foreign keys read as sentences.
      r.action.flow('delete', {
        texts: {
          label: 'Delete',
          confirm: 'Delete this segment? A segment that is in use or has history cannot be deleted: archive it instead.',
          notify: 'Segment deleted',
          doc: {
            summary:
              'Deletes a segment nothing names and that never had members. One in use or with history is refused with the reason: archive it instead.',
          },
        },
        icon: 'Trash2',
        variant: 'destructive',
        order: 1000,
        surfaces: { default: 'menu' },
        confirm: true,
        submit: {
          mutation: deleteSegment,
          retry: 'never',
          input: { segmentId: ref('record', 'id') },
          onUnknown: { check: segmentDeleted },
        },
        then: { notify: true, redirect: { resource: SEGMENT_RESOURCE, action: 'list' } },
      }),
    ],
  }),
  views: {
    list: {
      columns: [...SEGMENT_COLUMNS],
      optionalColumns: ['color', 'template_id', 'last_evaluation_failed_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['code', { field: 'name', op: 'contains' }] },
      filters: {
        pinned: ['kind', 'target', 'status'],
        fields: ['kind', 'target', 'status', 'template_id', 'member_count', 'last_evaluated_at', 'last_evaluation_failed_at'],
      },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'status', op: 'eq', value: 'active' }] } },
        { id: 'dynamic', texts: 'Dynamic', state: { filters: [{ field: 'kind', op: 'eq', value: 'dynamic' }] } },
        { id: 'manual', texts: 'Manual', state: { filters: [{ field: 'kind', op: 'eq', value: 'manual' }] } },
        { id: 'profiles', texts: 'Of profiles', state: { filters: [{ field: 'target', op: 'eq', value: 'profiles' }] } },
        { id: 'identities', texts: 'Of identities', state: { filters: [{ field: 'target', op: 'eq', value: 'identities' }] } },
        {
          id: 'failing',
          texts: 'Evaluation failing',
          state: { filters: [{ field: 'last_evaluation_failed_at', op: 'nnull', value: true }] },
        },
        { id: 'archived', texts: 'Archived', state: { filters: [{ field: 'status', op: 'eq', value: 'archived' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'kind', 'target', 'status', 'member_count'])],
      body: (l) => {
        const bySegment = [{ field: 'segment_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          l.tabs(
            [
              l.panel(
                [
                  'name',
                  'description',
                  ...definition(l, 'record'),
                  l.grid(['color', 'icon', 'template_id']),
                  l.grid(['last_evaluated_at', 'last_evaluation_failed_at']),
                  l.field('last_evaluation_error', { when: l.not(l.equals(l.ref('record', 'last_evaluation_error'), null)) }),
                  l.grid(['created_at', 'updated_at']),
                ],
                { key: 'details', texts: 'Details' },
              ),
              segmentMembersPanel(l),
              l.panel(
                [
                  l.place(segmentStatsBlock, { key: 'segment-trend', props: { segmentId: l.ref('record', 'id') } }),
                  l.place(relatedList(resourceByName(SEGMENT_DAILY_STAT_RESOURCE)), {
                    key: 'segment-daily-stats',
                    props: { where: [...bySegment], columns: ['day', 'member_count', 'added', 'removed'], open: 'none' },
                  }),
                ],
                { key: 'trend', texts: 'Trend' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(EVENT_RULE_SCOPE_HISTORY_RESOURCE)), {
                    key: 'segment-rule-scopes',
                    props: { where: [...bySegment], columns: ['version_id', 'created_at'], open: 'none' },
                  }),
                ],
                { key: 'rule-scopes', texts: 'Event rules scoped to it' },
              ),
            ],
            { key: 'sections' },
          ),
        ];
      },
    },
    create: {
      body: (l) => ['name', 'description', l.grid(['kind', 'target', 'status']), ...definition(l, 'values', true), l.grid(['color', 'icon'])],
    },
    edit: {
      header: (l) => [l.grid(['code', 'kind', 'target'])],
      body: (l) => ['name', 'description', 'status', ...definition(l, 'record', true), l.grid(['color', 'icon'])],
    },
  },
});
