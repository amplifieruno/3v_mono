import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { FACILITY_RESOURCE, LEGAL_HOLD_RESOURCE, RETENTION_POLICY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

/** How far ahead a plan looks: as of now, or as if the run happened in so many days. */
export const PLAN_HORIZONS = [0, 7, 30] as const;
export type PlanHorizon = (typeof PLAN_HORIZONS)[number];

/** The moment a plan counts at (`p_at`): now plus the horizon. */
export function planMoment(days: PlanHorizon, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** One target of the plan (`itap_results.retention_plan_rows`). */
export const planRow = z.object({
  data_class: z.string(),
  facility_id: z.string().nullable(),
  policy_id: z.string().nullable(),
  action: z.string(),
  retain_days: z.number(),
  cutoff: z.string(),
  /** Rows past the cutoff that a run would purge now. */
  candidates: z.number(),
  /** Rows past the cutoff that an active legal hold keeps. */
  held: z.number(),
});

export const retentionPlan = z.object({
  rows: z.array(planRow),
  /** Facility names by id, for the scope column. */
  facilities: z.record(z.string(), z.string()),
});

export type PlanRow = z.infer<typeof planRow>;
export type RetentionPlan = z.infer<typeof retentionPlan>;

const planInput = z.object({ days: z.union([z.literal(0), z.literal(7), z.literal(30)]) });

const facilityRow = z.object({ id: z.string(), name: z.string() });

export const retentionPlanOperation = hasuraOperation(COMPLIANCE_BINDING, 'retentionPlan', {
  kind: 'query',
  document: `query RetentionPlan($at: timestamptz!) {
  retention_plan(args: { p_at: $at }) {
    data_class
    facility_id
    policy_id
    action
    retain_days
    cutoff
    candidates
    held
  }
  facilities { id name }
}`,
  variables: (input) => ({ at: planMoment((input as z.infer<typeof planInput>).days) }),
  mapResult: (data) => {
    const rows = z.array(planRow).safeParse(rootOf(data, 'retention_plan'));
    const facilities = z.array(facilityRow).safeParse(rootOf(data, 'facilities'));
    return {
      rows: rows.success ? rows.data : [],
      facilities: Object.fromEntries((facilities.success ? facilities.data : []).map((row) => [row.id, row.name])),
    };
  },
});

/**
 * The retention plan (`retention_plan`, org_admin, STABLE): for each active policy (and the
 * consent window), the cutoff and how many rows a run at that moment would purge, and how many an
 * active legal hold keeps. A dry run: it is a GraphQL query and writes nothing, no run is recorded
 * and no file is queued (plan 12 Review Focus 2).
 */
export const retentionPlanQuery = defineQuery('itap:retention-plan', {
  binding: retentionPlanOperation.binding,
  input: schema(planInput),
  output: schema(retentionPlan),
  reads: [RETENTION_POLICY_RESOURCE, LEGAL_HOLD_RESOURCE, FACILITY_RESOURCE].map(resourceByName),
});

/** The plan's totals: rows to purge and rows kept by holds. */
export function planTotals(rows: readonly PlanRow[]): { candidates: number; held: number } {
  return rows.reduce((sum, row) => ({ candidates: sum.candidates + row.candidates, held: sum.held + row.held }), { candidates: 0, held: 0 });
}
