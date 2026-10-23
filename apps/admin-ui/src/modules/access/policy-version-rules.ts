import { type Check, type Rule, type RuleContext, isRecordProbe } from '@burojs/core';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const statusOf = (ctx: Pick<RuleContext, 'record'>): unknown => (ctx.record as Row)?.status;
const isProbe = (ctx: Pick<RuleContext, 'record'>): boolean => isRecordProbe(ctx.record) || typeof (ctx.record as Row)?.id !== 'string';
const lower = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '');

/** Whether the signed-in member submitted the rule's record (a pending version): they may not approve it. */
export function submittedBySignedIn(ctx: Pick<RuleContext, 'record' | 'user'>): boolean {
  if (isProbe(ctx)) return false;
  const submitter = lower((ctx.record as Row)?.submitted_by);
  return submitter !== '' && submitter === lower(ctx.user.id);
}

/** Why the submitter is not offered "Approve". */
export const FOUR_EYES_REASON = 'You submitted this version: another member must approve it (four-eyes rule). You can still reject it to take it back.';
/** Why a pending version cannot be edited or have its subjects and targets changed. */
export const PENDING_FROZEN_REASON =
  'Waiting for approval: the version is frozen so the approver approves exactly what was submitted. Reject it to change it.';
/** Why a published or superseded version cannot be edited. */
export const HISTORY_REASON =
  'A version that was in force is history and never changes: use “Draft a change” on the policy, or “Roll back to this version”.';

/**
 * - Only a draft is edited or discarded: a pending version is frozen (the database refuses with
 *   `access_policy_version_pending`), a published or superseded one is history.
 * - Four-eyes: the member who submitted a version is not offered "Approve"; the database refuses
 *   a forced call (`four_eyes_required`).
 */
export const VERSION_RULES: Rule[] = [
  {
    target: { kind: 'action', name: ['edit', 'delete'] },
    deny: 'run',
    when: (ctx) => !isProbe(ctx) && statusOf(ctx) === 'pending_approval',
    fallback: 'disable',
    reason: PENDING_FROZEN_REASON,
  },
  {
    target: { kind: 'action', name: ['edit', 'delete'] },
    deny: 'run',
    when: (ctx) => !isProbe(ctx) && (statusOf(ctx) === 'published' || statusOf(ctx) === 'superseded'),
    fallback: 'disable',
    reason: HISTORY_REASON,
  },
  {
    target: { kind: 'action', name: 'approve' },
    deny: 'run',
    when: submittedBySignedIn,
    fallback: 'disable',
    reason: FOUR_EYES_REASON,
  },
];

/** The instant of a date-time value, or `null`. */
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/** The draft form's checks, restating `access_policy_versions_valid_window` (Valid from before Valid until). */
export const VERSION_CHECKS: Check[] = [
  {
    id: 'validityOrdered',
    on: ['edit'],
    severity: 'error',
    anchor: 'valid_until',
    texts: 'Valid until must be after Valid from.',
    when: ({ values }) => {
      const from = instant(values.valid_from);
      const until = instant(values.valid_until);
      return from !== null && until !== null && until <= from;
    },
  },
];
