import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POLICY_SUBJECT_RESOURCE, ACCESS_POLICY_TARGET_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

/** The periods a simulation offers, each the last so many days up to now (the function takes at most 31). */
export const SIMULATION_PERIODS = ['1d', '7d', '30d'] as const;
export type SimulationPeriod = (typeof SIMULATION_PERIODS)[number];
const PERIOD_DAYS: Readonly<Record<SimulationPeriod, number>> = { '1d': 1, '7d': 7, '30d': 30 };

/** How many changed decisions a simulation lists (the function takes 1–100). */
export const SAMPLE_LIMITS = [20, 50, 100] as const;

/** `[from, to)` of a period ending at `now`. */
export function simulationBounds(period: SimulationPeriod, now: Date = new Date()): { from: string; to: string } {
  return { from: new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000).toISOString(), to: now.toISOString() };
}

/** One historical decision the version would change (`samples` of `simulate_access_policy`). */
export const simulationSample = z.object({
  decision_id: z.string(),
  decided_at: z.string(),
  access_point_id: z.string().nullable(),
  identity_id: z.string().nullable(),
  profile_id: z.string().nullable(),
  /** Today's policies, without the version (the baseline). */
  old_result: z.string(),
  old_reason: z.string().nullable(),
  /** With the version substituted for the policy's version in force (or added). */
  new_result: z.string(),
  new_reason: z.string().nullable(),
  /** What the door decided at the time. */
  recorded_result: z.string(),
  recorded_reason: z.string().nullable(),
  /** The baseline differs from what was recorded: the policies changed since. */
  drift: z.boolean(),
});

/** The answer of `simulate_access_policy` (`itap_results.access_policy_simulations`). */
export const simulation = z.object({
  version_id: z.string(),
  policy_id: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  decisions_in_period: z.number(),
  evaluated: z.number(),
  sampled: z.boolean(),
  unchanged: z.number(),
  granted_to_denied: z.number(),
  denied_to_granted: z.number(),
  reason_changed: z.number(),
  skipped: z.number(),
  drifted: z.number(),
  samples: z.array(simulationSample),
});

export type Simulation = z.infer<typeof simulation>;
export type SimulationSample = z.infer<typeof simulationSample>;

const simulationInput = z.object({
  versionId: z.string().uuid(),
  period: z.enum(SIMULATION_PERIODS),
  limit: z.number().int().min(1).max(100),
});

export const simulateAccessPolicyOperation = hasuraOperation(ACCESS_BINDING, 'simulateAccessPolicy', {
  kind: 'query',
  document: `query SimulateAccessPolicy($version: uuid!, $from: timestamptz!, $to: timestamptz!, $limit: Int!) {
  simulate_access_policy(args: { p_version: $version, p_from: $from, p_to: $to, p_limit: $limit }) {
    version_id
    policy_id
    period_from
    period_to
    decisions_in_period
    evaluated
    sampled
    unchanged
    granted_to_denied
    denied_to_granted
    reason_changed
    skipped
    drifted
    samples
  }
}`,
  variables: (input) => {
    const { versionId, period, limit } = input as z.infer<typeof simulationInput>;
    return { version: versionId, ...simulationBounds(period), limit };
  },
  mapResult: (data) => {
    const rows = rootOf(data, 'simulate_access_policy');
    const row = simulation.safeParse(Array.isArray(rows) ? rows[0] : null);
    return row.success ? row.data : null;
  },
});

/**
 * A what-if of a policy version (`simulate_access_policy`, STABLE: it writes nothing): the doors'
 * decisions of the period are evaluated again at their own time, once with today's policies and
 * once with this version in force, and the ones it would change are counted and listed (at most
 * 2 500 decisions are evaluated; an evenly spaced sample beyond). Refused with
 * `simulation_period_invalid` or `access_policy_version_not_found`.
 */
export const simulateAccessPolicy = defineQuery('itap:simulate-access-policy', {
  binding: simulateAccessPolicyOperation.binding,
  input: schema(simulationInput),
  output: schema(simulation.nullable()),
  reads: [ACCESS_POLICY_VERSION_RESOURCE, ACCESS_POLICY_SUBJECT_RESOURCE, ACCESS_POLICY_TARGET_RESOURCE].map(resourceByName),
});

/** The refusal code of a failed simulation read, when the function raised one of its own. */
export function simulationRefusal(error: unknown): 'gone' | 'period' | null {
  const text = JSON.stringify(error ?? null);
  if (text.includes('access_policy_version_not_found')) return 'gone';
  if (text.includes('simulation_period_invalid')) return 'period';
  return null;
}
