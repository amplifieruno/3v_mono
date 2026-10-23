import { type Check, type Rule, type RuleContext, isRecordProbe } from '@burojs/core';

type Row = Readonly<Record<string, unknown>> | null | undefined;

/** The instant of a date-time value, or `null`. */
export const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/** Whether a hold has started (`starts_at <= now`): its start is frozen from then on. */
export function holdStarted(record: Row, now: number = Date.now()): boolean {
  const start = instant(record?.starts_at);
  return start !== null && start <= now;
}

/** Whether a hold has ended (`ends_at <= now`): both its dates are frozen. */
export function holdEnded(record: Row, now: number = Date.now()): boolean {
  const end = instant(record?.ends_at);
  return end !== null && end <= now;
}

/** Whether a hold is in force now: `[starts_at, ends_at)`. */
export function holdActive(record: Row, now: number = Date.now()): boolean {
  return holdStarted(record, now) && !holdEnded(record, now);
}

/**
 * Why a change of the end is refused on a started hold: cleared (`cleared`) or moved later
 * (`extended`); `null` when it is kept, set for the first time or shortened. A hold not yet
 * started may be rescheduled freely (`legal_holds_timeline`).
 */
export function endChangeProblem(saved: Row, nextEnd: unknown, now: number = Date.now()): 'cleared' | 'extended' | null {
  if (!holdStarted(saved, now)) return null;
  const before = instant(saved?.ends_at);
  if (before === null) return null;
  const after = instant(nextEnd);
  if (after === null) return 'cleared';
  return after > before ? 'extended' : null;
}

const isRow = (ctx: Pick<RuleContext, 'record'>): boolean =>
  !isRecordProbe(ctx.record) && typeof (ctx.record as Row)?.id === 'string';

/** Why the start of a started hold is shown, never offered as an input (plan 12 Review Focus 3). */
export const START_FROZEN_REASON =
  'The hold has started: its start can no longer move, so what it protected from then on stays protected. Shorten the end or end it now instead.';
/** Why the dates of an ended hold are frozen. */
export const ENDED_REASON = 'The hold has ended: its dates are history and cannot change, and an ended hold is never reactivated. Create a new hold instead.';
/** Why "End now" is not offered on a hold that has not started. */
export const NOT_STARTED_REASON = 'The hold has not started yet: change its dates instead (before it starts they can move freely).';

/**
 * - The start of a started hold is not an input: shown with the reason and left out of the
 *   payload (the trigger refuses a move, `legal_hold_start_immutable`).
 * - The end of an ended hold is frozen the same way (`legal_hold_ended`).
 * - "End now" only on a started hold; an ended one does not offer it at all.
 */
export const LEGAL_HOLD_RULES: Rule[] = [
  {
    target: { kind: 'field', name: 'starts_at' },
    deny: 'edit',
    when: (ctx) => isRow(ctx) && holdStarted(ctx.record as Row),
    fallback: 'disable',
    reason: START_FROZEN_REASON,
  },
  {
    target: { kind: 'field', name: 'ends_at' },
    deny: 'edit',
    when: (ctx) => isRow(ctx) && holdEnded(ctx.record as Row),
    fallback: 'disable',
    reason: ENDED_REASON,
  },
  {
    target: { kind: 'action', name: 'end_now' },
    deny: 'run',
    when: (ctx) => isRow(ctx) && holdEnded(ctx.record as Row),
    fallback: 'hide',
  },
  {
    target: { kind: 'action', name: 'end_now' },
    deny: 'run',
    when: (ctx) => isRow(ctx) && !holdStarted(ctx.record as Row),
    fallback: 'disable',
    reason: NOT_STARTED_REASON,
  },
];

/** The form's checks, restating `legal_holds_period` and the one-way timeline of a started hold. */
export const LEGAL_HOLD_CHECKS: Check[] = [
  {
    id: 'holdPeriod',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'ends_at',
    texts: 'The end must be after the start.',
    when: ({ values, record }) => {
      const start = instant(values.starts_at ?? record?.starts_at);
      const end = instant(values.ends_at);
      return start !== null && end !== null && end <= start;
    },
  },
  {
    id: 'holdEndCleared',
    on: ['edit'],
    severity: 'error',
    anchor: 'ends_at',
    texts: 'A started hold keeps its end once it has one: shorten it or end the hold now, but do not clear it.',
    when: ({ values, record }) => 'ends_at' in values && endChangeProblem(record, values.ends_at) === 'cleared',
  },
  {
    id: 'holdEndExtended',
    on: ['edit'],
    severity: 'error',
    anchor: 'ends_at',
    texts: 'A started hold’s end can only move earlier. To keep the data longer, create another hold covering it.',
    when: ({ values, record }) => endChangeProblem(record, values.ends_at) === 'extended',
  },
  {
    id: 'holdEndPast',
    on: ['edit'],
    severity: 'warning',
    anchor: 'ends_at',
    texts: 'This end is already past: the hold ends now (an end is never set in the past).',
    when: ({ values, record, changed }) => {
      const end = instant(values.ends_at);
      return changed('ends_at') && holdStarted(record) && end !== null && end < Date.now();
    },
  },
];
