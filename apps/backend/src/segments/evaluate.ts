import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { segmentWhere } from './translate.js';
import { SegmentTranslateError, type CatalogField, type EvaluationContext, type SegmentTarget, type Where } from './types.js';

/**
 * Segment evaluation (spec §8.0, §8.5): the translator's inputs come from SQL (field catalog, time context), the
 * where runs through `reader` — an org_admin session of the organization, so Hasura permissions apply — and rule
 * membership is written by itap.sync_segment_members through `writer` (admin secret + organization session).
 */

const PAGE = 1000;

const CATALOG = `
  query SegmentFields($target: String!) {
    segment_fields(args: { p_target: $target }) { field value_type operators enum_values }
  }
`;
const CONTEXT = `
  query SegmentContext($at: timestamptz!, $target: String, $conditions: jsonb, $segment: uuid) {
    segment_evaluation_context(args: { p_at: $at, p_target: $target, p_conditions: $conditions, p_segment: $segment }) {
      organization_id local_date day_start day_end on_shift_schedule_ids segment_active
    }
  }
`;
const SEGMENT = `
  query SegmentForEvaluation($id: uuid!) {
    segments(where: { id: { _eq: $id } }) { id kind target conditions }
  }
`;
const SYNC = `
  mutation SyncSegmentMembers($segment: uuid!, $ids: _uuid!, $at: timestamptz!) {
    sync_segment_members(args: { p_segment: $segment, p_ids: $ids, p_at: $at }) {
      segment_id added removed member_count evaluated_at stale
    }
  }
`;

/** Business refusal with a stable code (the action layer turns it into ActionError). */
export class SegmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string = code) {
    super(message);
    this.name = 'SegmentError';
    this.code = code;
  }
}

/** The itap.raise_code codes the evaluation path can raise (segment_condition_invalid carries `:<path>`). */
const KNOWN_CODES = [
  'segment_condition_invalid',
  'segment_target_invalid',
  'segment_not_found',
  'segment_not_dynamic',
  'segment_evaluation_time_required',
];
const CODE_PATTERN = new RegExp(`(?:^|\\s)(${KNOWN_CODES.join('|')})(:\\S+)?(?:$|\\s)`);

/** Known SQL codes and translator errors -> SegmentError; anything else (incl. GraphQL errors) as is. */
export function mapSegmentError(error: unknown): unknown {
  if (error instanceof SegmentTranslateError) return new SegmentError('segment_condition_invalid', `segment_condition_invalid:${error.path}`);
  if (!(error instanceof HasuraError)) return error;
  const match = CODE_PATTERN.exec(`${error.detail ?? ''} ${error.message}`);
  return match ? new SegmentError(match[1], `${match[1]}${match[2] ?? ''}`) : error;
}

type ContextRow = {
  organization_id: string;
  local_date: string;
  day_start: string;
  day_end: string;
  on_shift_schedule_ids: string[];
  segment_active: boolean | null;
};

type Inputs = { organizationId: string; ctx: EvaluationContext; active: boolean | null };

async function loadContext(
  reader: HasuraClient,
  at: string,
  args: { target?: SegmentTarget; conditions?: unknown; segmentId?: string },
): Promise<Inputs> {
  const { segment_evaluation_context: [row] } = await reader.request<{ segment_evaluation_context: ContextRow[] }>(CONTEXT, {
    at,
    target: args.target ?? null,
    conditions: args.conditions ?? null,
    segment: args.segmentId ?? null,
  });
  const ctx: EvaluationContext = {
    at,
    localDate: row.local_date,
    dayStart: row.day_start,
    dayEnd: row.day_end,
    onShiftScheduleIds: row.on_shift_schedule_ids,
  };
  return { organizationId: row.organization_id, ctx, active: row.segment_active };
}

async function whereFor(reader: HasuraClient, target: SegmentTarget, conditions: unknown, inputs: Inputs): Promise<Where> {
  const { segment_fields: catalog } = await reader.request<{ segment_fields: CatalogField[] }>(CATALOG, { target });
  return segmentWhere(target, conditions, catalog, inputs.ctx, inputs.organizationId);
}

/** Every matching id, in id order (keyset pages). */
async function matchingIds(reader: HasuraClient, target: SegmentTarget, where: Where): Promise<string[]> {
  const query = `
    query SegmentMatches($where: ${target}_bool_exp!, $limit: Int!) {
      rows: ${target}(where: $where, order_by: { id: asc }, limit: $limit) { id }
    }
  `;
  const ids: string[] = [];
  for (;;) {
    const page: Where = ids.length ? { _and: [where, { id: { _gt: ids[ids.length - 1] } }] } : where;
    const { rows } = await reader.request<{ rows: { id: string }[] }>(query, { where: page, limit: PAGE });
    ids.push(...rows.map((r) => r.id));
    if (rows.length < PAGE) return ids;
  }
}

export type PreviewResult = { count: number; sample_ids: string[]; sample_labels: string[] };

type SampleRow = { id: string; code: string | null; first_name?: string; last_name?: string };

/** Count and first `limit` matches (id order) of unsaved conditions, validated first (segment_condition_invalid). */
export async function previewSegment(
  reader: HasuraClient,
  input: { target: SegmentTarget; conditions: unknown; limit: number; at: string },
): Promise<PreviewResult> {
  const inputs = await loadContext(reader, input.at, { target: input.target, conditions: input.conditions });
  const where = await whereFor(reader, input.target, input.conditions, inputs);
  const label = input.target === 'profiles' ? 'id code first_name last_name' : 'id code';
  const { total, sample } = await reader.request<{ total: { aggregate: { count: number } }; sample: SampleRow[] }>(
    `query SegmentPreview($where: ${input.target}_bool_exp!, $limit: Int!) {
       total: ${input.target}_aggregate(where: $where) { aggregate { count } }
       sample: ${input.target}(where: $where, order_by: { id: asc }, limit: $limit) { ${label} }
     }`,
    { where, limit: input.limit },
  );
  return {
    count: total.aggregate.count,
    sample_ids: sample.map((r) => r.id),
    sample_labels: sample.map((r) => (r.first_name !== undefined ? `${r.first_name} ${r.last_name}`.trim() : (r.code ?? r.id))),
  };
}

export type EvaluateResult = {
  segment_id: string;
  added: number;
  removed: number;
  member_count: number;
  evaluated_at: string;
  stale: boolean;
};

type SegmentRow = { id: string; kind: string; target: SegmentTarget; conditions: unknown };

/**
 * Evaluates a dynamic segment at `at`: matches every subject (none when the segment is not active then: status,
 * active_from / active_until, schedule) and syncs rule membership. Idempotent; manual rows are never touched.
 */
export async function evaluateSegment(
  deps: { reader: HasuraClient; writer: HasuraClient },
  segmentId: string,
  at: string,
): Promise<EvaluateResult> {
  const { segments: [segment] } = await deps.reader.request<{ segments: SegmentRow[] }>(SEGMENT, { id: segmentId });
  if (!segment) throw new SegmentError('segment_not_found');
  if (segment.kind !== 'dynamic') throw new SegmentError('segment_not_dynamic');
  const inputs = await loadContext(deps.reader, at, { segmentId });
  const ids = inputs.active
    ? await matchingIds(deps.reader, segment.target, await whereFor(deps.reader, segment.target, segment.conditions, inputs))
    : [];
  const { sync_segment_members: [result] } = await deps.writer.request<{ sync_segment_members: EvaluateResult[] }>(SYNC, {
    segment: segmentId,
    ids: `{${ids.join(',')}}`,
    at,
  });
  return result;
}
