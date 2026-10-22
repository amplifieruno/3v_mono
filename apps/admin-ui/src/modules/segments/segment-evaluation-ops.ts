import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  COMPANY_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  SEGMENT_DAILY_STAT_RESOURCE,
  SEGMENT_IDENTITY_MEMBER_RESOURCE,
  SEGMENT_PROFILE_MEMBER_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { SEGMENT_TARGETS } from '../../enums/segments';
import { conditionPathIn, describeConditionPath } from '../../fields/segment-conditions-path';
import { SEGMENTS_BINDING } from './segment-ops';

/** How many matches a preview lists by name (the action takes up to 100). */
export const PREVIEW_SAMPLE = 10;

export const previewInput = z.object({
  target: z.enum(SEGMENT_TARGETS),
  conditions: z.record(z.unknown()),
});

export type PreviewInput = z.infer<typeof previewInput>;

/** What `preview_segment` answers: how many match now, and the first ones (id order) with a label. */
export const previewResult = z.object({
  count: z.number().int(),
  sample_ids: z.array(z.string()),
  sample_labels: z.array(z.string()),
});

export type PreviewResult = z.infer<typeof previewResult>;

/** `preview_segment(target, conditions, limit)` (org_admin, a query action). */
export const previewSegmentOperation = hasuraOperation(SEGMENTS_BINDING, 'previewSegment', {
  kind: 'query',
  document: `query PreviewSegment($target: String!, $conditions: jsonb!, $limit: Int) {
  preview_segment(target: $target, conditions: $conditions, limit: $limit) { count sample_ids sample_labels }
}`,
  variables: (input) => ({ ...(input as PreviewInput), limit: PREVIEW_SAMPLE }),
  mapResult: (data) => rootOf(data, 'preview_segment') ?? null,
});

/**
 * Who unsaved conditions match now (`preview_segment`): the count and the first matches by name
 * (profiles by full name, identities by code). The backend validates the conditions first
 * (`segment_condition_invalid:<path>`) and matches with the caller's permissions; it writes
 * nothing, so a preview of a segment that is not saved yet creates nothing.
 */
export const previewSegment = defineQuery('itap:preview-segment', {
  binding: previewSegmentOperation.binding,
  input: schema(previewInput),
  output: schema(previewResult),
  reads: [resourceByName(PROFILE_RESOURCE), resourceByName(IDENTITY_RESOURCE), resourceByName(COMPANY_RESOURCE), resourceByName(SEGMENT_RESOURCE)],
});

/** Where a refusal's `segment_condition_invalid:<path>` points in `conditions`, for people. */
export function refusedCondition(message: string, conditions: unknown): string | null {
  const path = conditionPathIn(message);
  return path === null ? null : describeConditionPath(conditions, path);
}

/**
 * Why the backend refuses to evaluate a segment (`evaluate_segment`, codes of `SegmentError`),
 * before it writes anything. A condition the server no longer accepts (a custom field switched
 * off) is named from the conditions the flow carried along.
 */
export const evaluateSegmentRefusals: ActionRefusalReader = ({ code, message }, input) => {
  const conditions = (input as { readonly conditions?: unknown } | null)?.conditions;
  const text = ((): string | null => {
    switch (code) {
      case 'segment_not_found':
        return 'The segment no longer exists.';
      case 'segment_not_dynamic':
        return 'Only a dynamic segment is evaluated: a manual segment’s members are the ones added by hand.';
      case 'segment_condition_invalid': {
        const where = refusedCondition(message, conditions) ?? 'a condition';
        return `The conditions are no longer valid (${where}): a field or a record they name may have changed. Edit the conditions; the members stay as they were.`;
      }
      case 'segment_target_invalid':
        return 'The segment’s members are neither profiles nor identities: it cannot be evaluated.';
      default:
        return null;
    }
  })();
  return text === null ? null : [{ code, message: text, path: [] }];
};

/**
 * The segment to evaluate. `conditions` is not sent: it names the refused condition when the
 * server finds the stored conditions no longer valid.
 */
export const evaluateInput = z.object({ segmentId: z.string().uuid(), conditions: z.unknown().optional() });

/** What `evaluate_segment` answers (`SegmentEvaluation`). */
export const evaluationResult = z.object({
  segment_id: z.string(),
  added: z.number().int(),
  removed: z.number().int(),
  member_count: z.number().int(),
  evaluated_at: z.string(),
  stale: z.boolean(),
});

export type EvaluationResult = z.infer<typeof evaluationResult>;

/** `evaluate_segment(segment_id)` (org_admin, an action). */
export const evaluateSegmentOperation = hasuraOperation(
  SEGMENTS_BINDING,
  'evaluateSegment',
  {
    kind: 'mutation',
    document: `mutation EvaluateSegment($id: uuid!) {
  evaluate_segment(segment_id: $id) { segment_id added removed member_count evaluated_at stale }
}`,
    variables: (input) => ({ id: (input as z.infer<typeof evaluateInput>).segmentId }),
    mapResult: (data) => rootOf(data, 'evaluate_segment') ?? null,
  },
  evaluateSegmentRefusals,
);

/**
 * Evaluates a dynamic segment now, as the hourly run would: whoever matches joins (source rule),
 * rule members who no longer match leave; members added by hand are never removed. A segment that
 * is not active at this moment (status, active window, schedule) ends all its rule memberships.
 * `stale`: a newer evaluation had already run, so this one changed nothing.
 */
export const evaluateSegment = defineMutation('itap:evaluate-segment', {
  binding: evaluateSegmentOperation.binding,
  input: schema(evaluateInput),
  output: schema(evaluationResult),
  effects: [
    { resource: SEGMENT_RESOURCE },
    { resource: SEGMENT_PROFILE_MEMBER_RESOURCE },
    { resource: SEGMENT_IDENTITY_MEMBER_RESOURCE },
    { resource: SEGMENT_DAILY_STAT_RESOURCE },
  ],
});
