import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POLICY_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

/** The periods the analytics offer, each the last so many days up to now (the function takes at most 366). */
export const ANALYTICS_PERIODS = ['7d', '30d', '90d'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
const PERIOD_DAYS: Readonly<Record<AnalyticsPeriod, number>> = { '7d': 7, '30d': 30, '90d': 90 };

/** `[from, to)` of a period ending at `now`. */
export function analyticsBounds(period: AnalyticsPeriod, now: Date = new Date()): { from: string; to: string } {
  return { from: new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000).toISOString(), to: now.toISOString() };
}

const count = z.number();

export const versionHits = z.object({
  version_id: z.string(),
  policy_id: z.string(),
  policy_code: z.string(),
  policy_name: z.string(),
  version: z.number(),
  status: z.string(),
  effect: z.string(),
  priority: z.number(),
  enforced: z.boolean(),
  hits: count,
  granted: count,
  denied: count,
  last_hit_at: z.string().nullable(),
});
export const unusedVersion = z.object({ version_id: z.string(), policy_id: z.string(), policy_code: z.string(), policy_name: z.string(), effect: z.string() });
export const denialReason = z.object({ reason: z.string(), count });
export const topDenied = z.object({
  profile_id: z.string().nullable(),
  access_point_id: z.string(),
  denied: count,
  last_denied_at: z.string(),
});
export const overlapHint = z.object({
  version_a: z.string(),
  policy_a: z.string(),
  effect_a: z.string(),
  version_b: z.string(),
  policy_b: z.string(),
  effect_b: z.string(),
  kind: z.enum(['same_effect', 'conflicting']),
});
export const grantBuckets = z.object({ total: count, used: count, revoked: count, expired: count, unused: count });
export const complexity = z.object({
  enforced_policies: count,
  subjects: count,
  targets: count,
  schedules: count,
  max_risk: count,
  avg_subjects: count,
  avg_targets: count,
});

/** One row of `policy_analytics` (`itap_results.policy_analytics_rows`). */
export const analyticsRow = z.object({
  decisions: count,
  granted: count,
  denied: count,
  versions: z.array(versionHits),
  unused_versions: z.array(unusedVersion),
  denial_reasons: z.array(denialReason),
  top_denied: z.array(topDenied),
  overlap_hints: z.array(overlapHint),
  grants: grantBuckets,
  complexity,
});

export type AnalyticsRow = z.infer<typeof analyticsRow>;
export type VersionHits = z.infer<typeof versionHits>;
export type OverlapHint = z.infer<typeof overlapHint>;

/** The headline figures of a period, then the whole row under `detail`. */
export const policyAnalytics = z.object({
  decisions: count,
  granted: count,
  denied: count,
  enforced: count,
  unused: count,
  conflicts: count,
  grants: count,
  detail: analyticsRow,
});

export type PolicyAnalytics = z.infer<typeof policyAnalytics>;

/** The figures of a row: one read serves the facts block and the detail block, so they agree. */
export function analyticsOf(row: AnalyticsRow): PolicyAnalytics {
  return {
    decisions: row.decisions,
    granted: row.granted,
    denied: row.denied,
    enforced: row.complexity.enforced_policies,
    unused: row.unused_versions.length,
    conflicts: row.overlap_hints.filter((hint) => hint.kind === 'conflicting').length,
    grants: row.grants.total,
    detail: row,
  };
}

const analyticsInput = z.object({ period: z.enum(ANALYTICS_PERIODS) });

export const policyAnalyticsOperation = hasuraOperation(ACCESS_BINDING, 'policyAnalytics', {
  kind: 'query',
  document: `query PolicyAnalytics($from: timestamptz!, $to: timestamptz!) {
  policy_analytics(args: { p_from: $from, p_to: $to }) {
    decisions
    granted
    denied
    versions
    unused_versions
    denial_reasons
    top_denied
    overlap_hints
    grants
    complexity
  }
}`,
  variables: (input) => analyticsBounds((input as z.infer<typeof analyticsInput>).period),
  mapResult: (data) => {
    const rows = rootOf(data, 'policy_analytics');
    // One row per call; anything else is a broken answer, read as a failed query.
    return analyticsOf(analyticsRow.parse(Array.isArray(rows) ? rows[0] : null));
  },
});

/**
 * `policy_analytics(hasura_session, p_from, p_to)` for the last 7, 30 or 90 days: the doors'
 * decisions, how often each policy version decided (granted, denied, last time), enforced
 * versions that never decided, the denial reasons, the most denied person-door pairs, enforced
 * versions with the same subjects and targets (overlaps, conflicting when the effects differ),
 * how the grants of the period ended, and the size of the enforced rule set.
 */
export const policyAnalyticsQuery = defineQuery('itap:policy-analytics', {
  binding: policyAnalyticsOperation.binding,
  input: schema(analyticsInput),
  output: schema(policyAnalytics),
  reads: [ACCESS_POLICY_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE].map(resourceByName),
  fields: {
    decisions: f.number({ texts: { label: 'Decisions', doc: { summary: 'Decisions the doors made in the period, granted and denied.' } } }),
    granted: f.number({ texts: { label: 'Granted', doc: { summary: 'Decisions that let the person through.' } } }),
    denied: f.number({ texts: { label: 'Denied', doc: { summary: 'Decisions that refused the person, whatever the reason.' } } }),
    enforced: f.number({ texts: { label: 'Policies in force', doc: { summary: 'Policies with an approved version in force now.' } } }),
    unused: f.number({
      texts: { label: 'Unused in force', doc: { summary: 'Versions in force now that decided nothing in the period: candidates for review.' } },
    }),
    conflicts: f.number({
      texts: {
        label: 'Conflicting overlaps',
        doc: { summary: 'Pairs of versions in force naming the same people and places with opposite effects: priority decides between them.' },
      },
    }),
    grants: f.number({ texts: { label: 'Grants', doc: { summary: 'Access grants valid at some time in the period.' } } }),
  },
});

/** The figures of the facts block, in order. */
export const ANALYTICS_FACT_ROWS = ['decisions', 'granted', 'denied', 'enforced', 'unused', 'conflicts', 'grants'] as const;
