import { z } from 'zod';

/*
 * The access engine's trace (`access_decisions.signals`, `itap.evaluate_access`) read leniently:
 * every key is optional so an older or partial trace still reads (a missing list is empty, a
 * missing flag false), and nothing is shown as raw JSON (plan 10 Review Focus 5).
 */

const text = z.string().nullable().optional().catch(null);
const flag = z.boolean().nullable().optional().catch(null);
const num = z.number().nullable().optional().catch(null);
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).optional().catch([]);

const candidateRow = z.object({
  version_id: text,
  policy_id: text,
  effect: text,
  priority: num,
  max_risk: num,
  subject: text,
  target: text,
  valid: flag,
  schedule: text,
  matched: flag,
  decided: flag,
  simulated: flag,
});
const grantRow = z.object({ id: text, single_use: flag, applied: flag, used: flag, consumed: flag });
const overrideRow = z.object({ id: text, mode: text, applied: flag });
const overCapacityRow = z.object({ area_id: text, occupancy: num, capacity: num });

const traceRow = z.object({
  at: text,
  timezone: text,
  decided_by: text,
  epoch: num,
  simulated_version_id: text,
  person: z
    .object({
      profile_id: text,
      identity_id: text,
      profile_status: text,
      profile_type: text,
      access_level: text,
    })
    .optional()
    .catch(undefined),
  access_point: z.object({ id: text, area_id: text, direction: text }).optional().catch(undefined),
  overrides: list(overrideRow),
  candidates: list(candidateRow),
  grants: list(grantRow),
  signals: z
    .object({
      areas_over_capacity: list(overCapacityRow),
      recent_denials: num,
      device_id: text,
      device_health: text,
      ignored_device_id: text,
      unknown_identity: flag,
    })
    .optional()
    .catch(undefined),
  risk: z
    .object({ score: num, components: z.record(z.string(), z.number().nullable().catch(null)).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

/** Why a policy version the engine evaluated did or did not decide. */
export type CandidateOutcome = 'decided' | 'notThePerson' | 'notTheDoor' | 'notValid' | 'outsideSchedule' | 'outranked';

export interface TraceCandidate {
  readonly versionId: string | null;
  readonly effect: string | null;
  readonly priority: number | null;
  readonly maxRisk: number | null;
  readonly subject: string | null;
  readonly target: string | null;
  readonly valid: boolean;
  readonly schedule: string | null;
  readonly simulated: boolean;
  readonly outcome: CandidateOutcome;
}

export interface TraceGrant {
  readonly id: string | null;
  readonly singleUse: boolean;
  readonly applied: boolean;
  readonly consumed: boolean;
}

export interface TraceOverride {
  readonly id: string | null;
  readonly mode: string | null;
  readonly applied: boolean;
}

/** A risk component that added to the score. */
export interface RiskPart {
  readonly key: string;
  readonly value: number;
}

export interface Trace {
  readonly decidedBy: string | null;
  readonly timezone: string | null;
  readonly epoch: number | null;
  readonly person: {
    readonly known: boolean;
    readonly status: string | null;
    readonly type: string | null;
    readonly level: string | null;
  };
  readonly overrides: readonly TraceOverride[];
  readonly candidates: readonly TraceCandidate[];
  readonly grants: readonly TraceGrant[];
  readonly riskScore: number | null;
  readonly riskParts: readonly RiskPart[];
  readonly overCapacityAreaIds: readonly string[];
  readonly recentDenials: number;
  readonly deviceHealth: string | null;
  readonly ignoredDevice: boolean;
}

/** The order the risk components are listed in (`itap.evaluate_access`). */
export const RISK_PARTS = ['unknown_identity', 'recent_denials', 'over_capacity', 'device_health'] as const;

/** Why a candidate did or did not decide: the first unmet condition in the engine's order. */
export function candidateOutcome(c: z.infer<typeof candidateRow>): CandidateOutcome {
  if (c.decided === true) return 'decided';
  if (c.subject === null || c.subject === undefined) return 'notThePerson';
  if (c.target === null || c.target === undefined) return 'notTheDoor';
  if (c.valid !== true) return 'notValid';
  if (c.schedule === 'out') return 'outsideSchedule';
  return 'outranked';
}

/** The trace of a decision's `signals`, or `null` when it is no object. */
export function traceOf(signals: unknown): Trace | null {
  if (signals === null || typeof signals !== 'object' || Array.isArray(signals)) return null;
  const parsed = traceRow.safeParse(signals);
  if (!parsed.success) return null;
  const t = parsed.data;
  const components = t.risk?.components ?? {};
  return {
    decidedBy: t.decided_by ?? null,
    timezone: t.timezone ?? null,
    epoch: t.epoch ?? null,
    person: {
      known: typeof t.person?.profile_id === 'string',
      status: t.person?.profile_status ?? null,
      type: t.person?.profile_type ?? null,
      level: t.person?.access_level ?? null,
    },
    overrides: (t.overrides ?? []).map((o) => ({ id: o.id ?? null, mode: o.mode ?? null, applied: o.applied === true })),
    candidates: (t.candidates ?? []).map((c) => ({
      versionId: c.version_id ?? null,
      effect: c.effect ?? null,
      priority: c.priority ?? null,
      maxRisk: c.max_risk ?? null,
      subject: c.subject ?? null,
      target: c.target ?? null,
      valid: c.valid === true,
      schedule: c.schedule ?? null,
      simulated: c.simulated === true,
      outcome: candidateOutcome(c),
    })),
    // `applied` since the engine's first fix round; `used` before it.
    grants: (t.grants ?? []).map((g) => ({
      id: g.id ?? null,
      singleUse: g.single_use === true,
      applied: g.applied === true || g.used === true,
      consumed: g.consumed === true,
    })),
    riskScore: t.risk?.score ?? null,
    riskParts: RISK_PARTS.flatMap((key) => {
      const value = components[key];
      return typeof value === 'number' && value > 0 ? [{ key, value }] : [];
    }),
    overCapacityAreaIds: (t.signals?.areas_over_capacity ?? []).flatMap((a) => (typeof a.area_id === 'string' ? [a.area_id] : [])),
    recentDenials: t.signals?.recent_denials ?? 0,
    deviceHealth: t.signals?.device_health ?? null,
    ignoredDevice: typeof t.signals?.ignored_device_id === 'string',
  };
}

/** A score from 0 to 1 as text with two decimals (`0.45`). */
export function formatRisk(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}
