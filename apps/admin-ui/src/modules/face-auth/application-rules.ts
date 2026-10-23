import { type Check, type Rule, type RuleContext, isRecordProbe } from '@burojs/core';
import { BINDINGS } from './binding-targets';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const isProbe = (ctx: Pick<RuleContext, 'record'>): boolean => isRecordProbe(ctx.record) || typeof (ctx.record as Row)?.id !== 'string';

/** Whether the rule's record is a sandbox application. */
export const isSandbox = (ctx: Pick<RuleContext, 'record'>): boolean => !isProbe(ctx) && (ctx.record as Row)?.is_sandbox === true;
/** Whether the rule's record is a revoked application. */
export const isRevoked = (ctx: Pick<RuleContext, 'record'>): boolean => !isProbe(ctx) && (ctx.record as Row)?.status === 'revoked';

/** Why a sandbox application is not offered facilities and access points. */
export const SANDBOX_REASON =
  'A sandbox application authenticates only the synthetic test identities of its segment, never people at a place: it binds no facilities or access points.';
/** Why a revoked application is neither edited nor bound to anything new. */
export const REVOKED_REASON = 'The application is revoked: it refuses every request for good, so its settings and bindings no longer change.';

/** The binding flows a sandbox application is not offered (`sandbox_population_check`). */
export const LOCATION_FLOWS = BINDINGS.filter((b) => !b.sandbox).map((b) => b.flow);

/**
 * - A sandbox application is not offered "Add facility" and "Add access point" (hidden, with the
 *   reason); a forced call is refused by the database (`sandbox_location_binding`, mapped).
 * - A revoked application is not edited and gets no new binding (disabled, with the reason).
 */
export const APPLICATION_RULES: Rule[] = [
  {
    target: { kind: 'action', name: LOCATION_FLOWS },
    deny: 'run',
    when: isSandbox,
    fallback: 'hide',
    reason: SANDBOX_REASON,
  },
  {
    target: { kind: 'action', name: ['edit', ...BINDINGS.map((b) => b.flow)] },
    deny: 'run',
    when: isRevoked,
    fallback: 'disable',
    reason: REVOKED_REASON,
  },
];

const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Whether `low` and `high` are both numbers and `low` is above `high`. */
const above = (low: unknown, high: unknown): boolean => {
  const a = number(low);
  const b = number(high);
  return a !== null && b !== null && a > b;
};

/**
 * The form's checks, restating `client_applications_threshold_range`
 * (`0 <= threshold_min <= threshold <= threshold_max <= 1`; each field checks its own 0..1).
 */
export const THRESHOLD_CHECKS: Check[] = [
  {
    id: 'thresholdAtLeastMin',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'threshold',
    texts: 'The threshold must not be below the minimum threshold.',
    when: ({ values }) => above(values.threshold_min, values.threshold),
  },
  {
    id: 'thresholdAtMostMax',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'threshold',
    texts: 'The threshold must not be above the maximum threshold.',
    when: ({ values }) => above(values.threshold, values.threshold_max),
  },
  {
    id: 'minAtMostMax',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'threshold_max',
    texts: 'The maximum threshold must not be below the minimum threshold.',
    when: ({ values }) => above(values.threshold_min, values.threshold_max),
  },
];
