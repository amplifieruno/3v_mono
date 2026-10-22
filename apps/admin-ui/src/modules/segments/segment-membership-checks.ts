import type { FlowUnknownCheck } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { SEGMENT_IDENTITY_MEMBER_RESOURCE, SEGMENT_PROFILE_MEMBER_RESOURCE, SEGMENT_RESOURCE } from '../../data/resource-names';
import type { SEGMENT_TARGETS } from '../../enums/segments';

/** What a segment's members are. */
export type SegmentTarget = (typeof SEGMENT_TARGETS)[number];

/** The membership resource and its subject column for a segment target. */
export const MEMBER_RESOURCE_OF = {
  profiles: { resource: SEGMENT_PROFILE_MEMBER_RESOURCE, subject: 'profile_id' },
  identities: { resource: SEGMENT_IDENTITY_MEMBER_RESOURCE, subject: 'identity_id' },
} as const satisfies Record<SegmentTarget, { readonly resource: string; readonly subject: string }>;

/** What one "add" flow asked for: the segment, the people or faces to add, and the segment's target. */
export interface SentMembership {
  readonly segmentId: string;
  readonly subjectIds: readonly string[];
  readonly target: SegmentTarget;
}

/**
 * What each "add" flow last sent, by the flow's name and record id: what "Check again" after a lost
 * answer reads, since a check sees the record, not the form's values (`tasks/ui/buro-gaps.md` G12).
 * Filled when the input is built, just before sending.
 */
const sent = new Map<string, SentMembership>();

/** Remembers what the `flow` on `recordId` is about to send. */
export function rememberSent(flow: string, recordId: string, membership: SentMembership): void {
  sent.set(`${flow}:${recordId}`, membership);
}

/**
 * Whether every one `membership` sent is open now as a manual member; `null` when the read fails.
 * A person or face has at most one open membership per segment, so the open manual rows among the
 * ones sent number as many as were sent exactly when all of them are open.
 */
async function manualOpen(data: Parameters<FlowUnknownCheck>[0]['data'], membership: SentMembership): Promise<boolean | null> {
  const { resource, subject } = MEMBER_RESOURCE_OF[membership.target];
  const ids = [...new Set(membership.subjectIds)];
  if (ids.length === 0) return null;
  try {
    const { data: rows } = await data.list(resourceByName(resource) as never, {
      filter: {
        and: [
          { field: 'segment_id', op: 'eq', value: membership.segmentId },
          { field: subject, op: 'in', value: ids },
          { field: 'removed_at', op: 'isNull' },
          { field: 'source', op: 'eq', value: 'manual' },
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: ids.length },
    } as never);
    const open = new Set((rows as readonly Readonly<Record<string, unknown>>[]).map((row) => row[subject] ?? row.id));
    return open.size >= ids.length;
  } catch {
    return null;
  }
}

/**
 * Check again for an "add" flow: applied when every person or face it sent is now a manual member
 * of the segment (the function adds all or nothing; someone added by hand by another user in the
 * meantime counts too). Unknown when nothing was recorded (the console was reloaded) or the read
 * fails.
 */
export function addApplied(flow: string): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    const membership = typeof id === 'string' ? sent.get(`${flow}:${id}`) : undefined;
    if (membership === undefined) return 'unknown';
    const open = await manualOpen(data, membership);
    return open === null ? 'unknown' : open ? 'applied' : 'not-applied';
  };
}

/**
 * Check again for "Remove from segment" on a membership row: applied when the row is closed now.
 * Reads the row by id from its own resource.
 */
export function removeApplied(target: SegmentTarget): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(MEMBER_RESOURCE_OF[target].resource) as never, { id } as never);
      if (row === null || row === undefined) return 'unknown';
      const removed = (row as Readonly<Record<string, unknown>>).removed_at;
      return typeof removed === 'string' && removed !== '' ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}

/** Each segment's `last_evaluated_at` when "Evaluate now" was sent, by segment id. */
const evaluatedBefore = new Map<string, string | null>();

/** Remembers the segment's last evaluation as "Evaluate now" is about to send. */
export function rememberEvaluation(segmentId: string, lastEvaluatedAt: unknown): void {
  evaluatedBefore.set(segmentId, typeof lastEvaluatedAt === 'string' ? lastEvaluatedAt : null);
}

/**
 * Check again for "Evaluate now": applied when the segment was evaluated after the one it showed
 * when sent (this evaluation, or the hourly one since: either way the members are current).
 */
export const evaluationApplied: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || !evaluatedBefore.has(id)) return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(SEGMENT_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    const now = Date.parse(String((row as Readonly<Record<string, unknown>>).last_evaluated_at ?? ''));
    const before = Date.parse(evaluatedBefore.get(id) ?? '');
    if (Number.isNaN(now)) return 'not-applied';
    return Number.isNaN(before) || now > before ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};
