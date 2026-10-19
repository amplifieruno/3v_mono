import type { ManualMember, SegmentSpec } from './segmentPlan.js';

/**
 * The seeded segments and their whole history as ONE GraphQL mutation (Hasura runs the root fields of a request in
 * order, in one transaction): the segment rows, the back-dated manual rows, every itap.sync_segment_members call of
 * the history in ascending time (the memberships the evaluator matched at each time; sync ignores a stale `at`, so
 * the order matters), then itap.refresh_segment_daily_stats for every day.
 *
 * One transaction keeps the live evaluation crons out: they evaluate at wall-clock now, and a sync at now committed
 * between two history syncs would make every later (past) sync stale. The crons only see the segments once their
 * history is complete.
 */
export type SegmentInsert = { id: string; spec: SegmentSpec; templateId: string | null };
export type ManualInsert = { segmentId: string; member: ManualMember };
export type HistorySync = { segmentId: string; at: number; ids: string[] };

export type SegmentHistoryMutation = { query: string; variables: Record<string, unknown>; syncFields: string[] };

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export function buildSegmentHistoryMutation(args: {
  organization: string;
  createdAt: number;
  /** User id of the admin (an organization member) who added (and removed) the manual members. */
  addedBy: string;
  segments: SegmentInsert[];
  manual: ManualInsert[];
  syncs: HistorySync[];
  statsTimes: number[];
}): SegmentHistoryMutation {
  const { organization } = args;
  const created = iso(args.createdAt);
  const defs: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, unknown> = {};

  if (args.segments.length > 0) {
    defs.push('$segments: [segments_insert_input!]!');
    variables.segments = args.segments.map(({ id, spec, templateId }) => ({
      id,
      organization_id: organization,
      name: spec.name,
      description: spec.description,
      color: spec.color,
      icon: spec.icon,
      kind: spec.kind,
      target: spec.target,
      conditions: spec.conditions,
      status: spec.status,
      active_from: iso(spec.activeFrom),
      active_until: iso(spec.activeUntil),
      schedule: spec.schedule,
      template_id: templateId,
      created_at: created,
    }));
    fields.push('segments: insert_segments(objects: $segments) { affected_rows }');
  }

  if (args.manual.length > 0) {
    const targets = new Map(args.segments.map((s) => [s.id, s.spec.target]));
    defs.push('$manual: [segment_members_insert_input!]!');
    variables.manual = args.manual.map(({ segmentId, member }) => {
      const target = targets.get(segmentId);
      if (target !== 'profiles') throw new Error(`seed: manual members need a new profile segment (${segmentId})`);
      return {
        organization_id: organization,
        segment_id: segmentId,
        target,
        profile_id: member.profileId,
        source: 'manual',
        added_by: args.addedBy,
        added_at: iso(member.addedAt),
        removed_at: iso(member.removedAt),
        removed_by: member.removedAt === null ? null : args.addedBy,
        created_at: iso(member.addedAt),
      };
    });
    fields.push('manual: insert_segment_members(objects: $manual) { affected_rows }');
  }

  const syncs = [...args.syncs].sort((a, b) => a.at - b.at || (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0));
  const syncFields = syncs.map((sync, i) => {
    defs.push(`$ids${i}: _uuid!`);
    variables[`ids${i}`] = `{${sync.ids.join(',')}}`;
    fields.push(
      `s${i}: sync_segment_members(args: { p_segment: "${sync.segmentId}", p_ids: $ids${i}, p_at: "${iso(sync.at)}" }) { stale }`,
    );
    return `s${i}`;
  });

  if (args.statsTimes.length > 0) {
    defs.push('$org: uuid!');
    variables.org = organization;
  }
  args.statsTimes.forEach((at, i) => {
    fields.push(`d${i}: refresh_segment_daily_stats(args: { p_organization: $org, p_at: "${iso(at)}" }) { id }`);
  });

  const query = `mutation SeedSegmentHistory(${defs.join(', ')}) {\n  ${fields.join('\n  ')}\n}`;
  return { query, variables, syncFields };
}
