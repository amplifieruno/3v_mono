import { f } from '@burojs/field-types';
import { SEGMENT_TEMPLATE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import {
  SEGMENT_KINDS,
  SEGMENT_KIND_ENUM,
  SEGMENT_STATUSES,
  SEGMENT_STATUS_ENUM,
  SEGMENT_TARGETS,
  SEGMENT_TARGET_ENUM,
} from '../../enums/segments';
import { dateTime } from '../../fields/date-time';
import { checkHexColor } from '../../fields/hex-color';
import { checkNotBlank } from '../../fields/not-blank';
import { timeWindows } from '../../fields/time-windows';

/** The conditions' help, shared by segments and templates (the grammar is `tasks/data-layer/design.md` §6.5). */
export const CONDITIONS_SUMMARY =
  'Who belongs to a dynamic segment, as a tree of conditions: groups `{"op": "and" | "or" | "not", "children": [...]}` and conditions `{"field", "operator", "value"}` over the fields of the segment’s target (status, type, company, visits in the last 30 days and so on). The server checks every field, operator and value; a manual segment has none.';

/**
 * Columns of `itap.segments` the `org_admin` role reads. Kind and target are chosen once
 * (`segments_fixed_kind`); member count and the evaluation stamps are written by the evaluation
 * (`evaluate_segments*` crons, `sync_segment_members`).
 */
export const segmentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show', 'edit'],
    texts: { label: 'Code', doc: { summary: 'The segment’s number in the organization (SEGMENT-00004), given on creation.' } },
  }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'Unique in the organization; rules, policies and reports name the segment by it.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  kind: enumField(SEGMENT_KINDS, SEGMENT_KIND_ENUM, {
    required: true,
    default: 'manual',
    write: 'create',
    texts: {
      label: 'Kind',
      doc: {
        summary:
          'Manual: members are added by hand. Dynamic: members are whoever matches the conditions, re-evaluated as the data changes. Fixed once the segment exists.',
      },
    },
  }),
  target: enumField(SEGMENT_TARGETS, SEGMENT_TARGET_ENUM, {
    required: true,
    default: 'profiles',
    write: 'create',
    texts: {
      label: 'Members are',
      doc: {
        summary:
          'Profiles (known people) or identities (faces, unknown ones included). Decides which fields the conditions offer; fixed once the segment exists.',
      },
    },
  }),
  status: enumField(SEGMENT_STATUSES, SEGMENT_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Active segments are evaluated and used; inactive ones are kept but not evaluated; archived ones are retired with their history. A segment in use is archived, not deleted.',
      },
    },
  }),
  conditions: f.json({
    default: {},
    in: ['show', 'create', 'edit'],
    texts: { label: 'Conditions', doc: { summary: CONDITIONS_SUMMARY } },
  }),
  color: f.string({
    nullable: true,
    validate: checkHexColor(),
    texts: { label: 'Colour', doc: { summary: 'How the segment is marked on screens, as #rrggbb; empty for none.' } },
  }),
  icon: f.string({
    nullable: true,
    in: ['show', 'create', 'edit'],
    texts: { label: 'Icon', doc: { summary: 'An icon name shown beside the segment on screens (a lucide name such as `Star`); empty for none.' } },
  }),
  active_from: dateTime({
    in: ['show', 'create', 'edit'],
    texts: { label: 'Active from', doc: { summary: 'Before this moment the segment has no rule members; empty = no start.' } },
  }),
  active_until: dateTime({
    in: ['show', 'create', 'edit'],
    texts: { label: 'Active until', doc: { summary: 'From this moment on the segment has no rule members; empty = no end. After the start.' } },
  }),
  schedule: timeWindows({
    emptyText: 'Always',
    nullable: true,
    texts: {
      label: 'Schedule',
      doc: {
        summary:
          'Weekly hours in the organization’s time zone when a dynamic segment holds its rule members, such as weekdays 08:00–18:00; outside them its rule memberships are closed. No windows = always.',
      },
    },
  }),
  member_count: f.number({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Members', doc: { summary: 'How many people or faces are members now, kept by the server.' } },
  }),
  last_evaluated_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Last evaluated', doc: { summary: 'When the conditions of a dynamic segment were last evaluated (hourly, and shortly after its inputs change).' } },
  }),
  last_evaluation_error: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: {
      label: 'Evaluation error',
      doc: {
        summary:
          'Why the latest evaluation failed (for example, a condition names a custom field that was switched off); the members stay as they were until an evaluation succeeds.',
      },
    },
  }),
  last_evaluation_failed_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Evaluation failed', doc: { summary: 'When the latest failed evaluation ran; empty once one succeeds.' } },
  }),
  template_id: f.relation({
    to: SEGMENT_TEMPLATE_RESOURCE,
    nullable: true,
    // Set only by "Create segment" on a template (its own insert, with the template's target).
    write: 'never',
    open: 'page',
    in: ['list', 'show'],
    providerOptions: { relationship: 'template' },
    texts: { label: 'Template', doc: { summary: 'The template the segment was created from, if any; its conditions were copied then.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
