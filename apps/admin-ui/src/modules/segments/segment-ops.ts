import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { hasuraOperation, rootOf } from '../../data/operations';
import { SEGMENT_RESOURCE, SEGMENT_TEMPLATE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { SEGMENT_TARGETS } from '../../enums/segments';
import { describeConditionPath } from '../../fields/segment-conditions-path';

/** The registry key the segment operations are bound under. */
export const SEGMENTS_BINDING = 'segments';

const KEEP = ' Archive the segment instead (Status: Archived): it stops being evaluated and keeps its history. Nothing was deleted.';

/**
 * Why the database refuses to delete a segment: the guard `segments_guard_referenced`
 * (`segment_referenced`: another segment's or a template's conditions, or a notification rule's
 * conditions, name it) and the NO ACTION foreign keys of everything that keeps a segment's history
 * or names it (`tasks/data-layer/design.md` §6.5: "a segment with history is archived, not deleted").
 */
export const DELETE_SEGMENT_REFUSALS = {
  segment_referenced:
    'This segment is named by the conditions of a notification rule, of another segment or of a segment template: remove it there first, or archive it.' +
    KEEP,
  event_rule_version_scopes_segment_fkey: 'An event rule version is scoped to this segment, and a version keeps its scope as history.' + KEEP,
  segment_members_segment_fkey: 'The segment has had members, and its membership history is kept.' + KEEP,
  segment_daily_stats_segment_fkey: 'The segment has daily figures, and its trend is kept.' + KEEP,
  access_policy_version_subjects_segment_fkey: 'An access policy version names this segment as its subject.' + KEEP,
  client_application_segments_segment_fkey: 'A face-authentication client application is bound to this segment.' + KEEP,
  report_segments_segment_fkey: 'A report covers this segment.' + KEEP,
} satisfies Record<string, SqlRefusalText>;

/**
 * Why the database refuses a segment created from a template: the name is taken
 * (`segments_organization_id_name_key`), the template's conditions no longer hold
 * (`segment_condition_invalid:<path>`, e.g. a custom field was switched off), or the template is
 * gone (`segments_template_fkey`).
 */
export const CREATE_FROM_TEMPLATE_REFUSALS = {
  segments_organization_id_name_key: 'A segment of this name already exists: choose another name. Nothing was created.',
  segments_name_not_blank: 'Enter a name. Nothing was created.',
  segment_condition_invalid: (path: string) =>
    `The template’s conditions are no longer valid here (at ${path}): a field or a record they name may have changed. Nothing was created.`,
  segment_conditions_required: 'The template has no conditions. Nothing was created.',
  segments_template_fkey: 'The template no longer exists. Nothing was created.',
} satisfies Record<string, SqlRefusalText>;

/**
 * {@link CREATE_FROM_TEMPLATE_REFUSALS}, with the refused condition named from the conditions the
 * flow sent (`segment_condition_invalid:$.children[2].value` → the value of the condition on
 * “end_date” (3)): the flow form has no conditions editor to mark.
 */
export const createFromTemplateRefusals: ActionRefusalReader = (error, input) => {
  const conditions = (input as { readonly conditions?: unknown } | null)?.conditions;
  return sqlRefusals({
    ...CREATE_FROM_TEMPLATE_REFUSALS,
    segment_condition_invalid: (path: string) =>
      `The template’s conditions are no longer valid here (${describeConditionPath(conditions, path)}): a field or a record they name may have changed. Nothing was created.`,
  })(error, input);
};

export const deleteSegmentInput = z.object({ segmentId: z.string().uuid() });

/** `delete_segments_by_pk` (org_admin) with the refusals read as sentences. */
export const deleteSegmentOperation = hasuraOperation(
  SEGMENTS_BINDING,
  'deleteSegment',
  {
    kind: 'mutation',
    document: `mutation DeleteSegment($id: uuid!) {
  delete_segments_by_pk(id: $id) { id }
}`,
    variables: (input) => ({ id: (input as z.infer<typeof deleteSegmentInput>).segmentId }),
    mapResult: (data) => rootOf(data, 'delete_segments_by_pk') ?? null,
  },
  sqlRefusals(DELETE_SEGMENT_REFUSALS),
);

/** Deletes a segment nothing names and with no history; the database refuses any other (archive it). */
export const deleteSegment = defineMutation('itap:delete-segment', {
  binding: deleteSegmentOperation.binding,
  input: schema(deleteSegmentInput),
  output: schema(z.object({ id: z.string() }).nullable()),
  effects: [{ resource: SEGMENT_RESOURCE }],
});

export const createFromTemplateInput = z.object({
  templateId: z.string().uuid(),
  target: z.enum(SEGMENT_TARGETS),
  conditions: z.record(z.unknown()),
  name: z.string(),
  description: z.string().nullable().optional(),
});

/** Trimmed text, or `null` when blank. */
function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

/** `insert_segments_one`: a dynamic segment with the template's target and a copy of its conditions. */
export const createFromTemplateOperation = hasuraOperation(
  SEGMENTS_BINDING,
  'createSegmentFromTemplate',
  {
    kind: 'mutation',
    document: `mutation CreateSegmentFromTemplate(
  $name: String!
  $description: String
  $target: segment_targets_enum!
  $conditions: jsonb!
  $template: uuid!
) {
  insert_segments_one(
    object: {
      name: $name
      description: $description
      kind: dynamic
      target: $target
      conditions: $conditions
      template_id: $template
    }
  ) {
    id
    code
  }
}`,
    variables: (input) => {
      const { templateId, target, conditions, name, description } = input as z.infer<typeof createFromTemplateInput>;
      return { name: name.trim(), description: textOrNull(description), target, conditions, template: templateId };
    },
    mapResult: (data) => rootOf(data, 'insert_segments_one') ?? null,
  },
  createFromTemplateRefusals,
);

/** A dynamic segment started from a template: its target, conditions and a name of its own. */
export const createSegmentFromTemplate = defineMutation('itap:create-segment-from-template', {
  binding: createFromTemplateOperation.binding,
  input: schema(createFromTemplateInput),
  output: schema(z.object({ id: z.string(), code: z.string() }).nullable()),
  effects: [{ resource: SEGMENT_RESOURCE }, { resource: SEGMENT_TEMPLATE_RESOURCE }],
});

export const SEGMENT_OPERATIONS = [deleteSegmentOperation, createFromTemplateOperation];
