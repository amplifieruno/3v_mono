import type { HasuraClient } from '../../../src/hasura/client.js';
import { accessWorld, createPolicyWithDraft, publishVersion, type AccessWorld } from './access.js';
import { callFn, insertOne } from './operations.js';
import { runSqlRows } from './sql.js';

/** Helpers for the access decision engine (slice 8 task 2): itap.evaluate_access / check_access. */

export type Evaluation = {
  result: string;
  reason: string;
  policy_version_id: string | null;
  grant_id: string | null;
  risk_score: number;
  signals: Trace;
  decision_id: string | null;
  override_id: string | null;
};

export type Candidate = {
  version_id: string;
  policy_id: string;
  effect: string;
  priority: number;
  subject: string | null;
  target: string | null;
  valid: boolean;
  schedule: string;
  matched: boolean;
  decided: boolean;
  simulated: boolean;
};

export type Trace = {
  at: string;
  timezone: string;
  person: Record<string, unknown>;
  overrides: Record<string, unknown>[];
  candidates: Candidate[];
  grants: Record<string, unknown>[];
  signals: Record<string, unknown>;
  risk: { score: number; components: Record<string, number> };
  decided_by: string;
};

export type EvalOptions = {
  identity?: string | null;
  profile?: string | null;
  device?: string | null;
  at?: string | null;
  record?: boolean;
  overrideVersion?: string | null;
};

const lit = (v: string | null | undefined, type: string): string => (v ? `'${v}'::${type}` : `null::${type}`);

/** Calls itap.evaluate_access through run_sql (admin) and returns the composite as a typed row. */
export async function evaluate(org: string, accessPoint: string, o: EvalOptions = {}): Promise<Evaluation> {
  const [row] = await runSqlRows(`select r.result, r.reason, r.policy_version_id, r.grant_id, r.risk_score, r.signals,
      r.decision_id, r.override_id
    from itap.evaluate_access('${org}', '${accessPoint}', ${lit(o.identity, 'uuid')}, ${lit(o.profile, 'uuid')},
      ${lit(o.device, 'uuid')}, ${lit(o.at, 'timestamptz')}, ${o.record ? 'true' : 'false'}, ${lit(o.overrideVersion, 'uuid')}) r`);
  const nul = (v: string | null | undefined): string | null => (v === null || v === undefined || v === 'NULL' ? null : v);
  return {
    result: row.result ?? '',
    reason: row.reason ?? '',
    policy_version_id: nul(row.policy_version_id),
    grant_id: nul(row.grant_id),
    risk_score: Number(row.risk_score),
    signals: JSON.parse(row.signals ?? '{}') as Trace,
    decision_id: nul(row.decision_id),
    override_id: nul(row.override_id),
  };
}

export type Decision = {
  id: string;
  result: string;
  reason: string;
  policy_version_id: string | null;
  grant_id: string | null;
  override_id: string | null;
  identity_id: string | null;
  profile_id: string | null;
  device_id: string | null;
  access_point_id: string | null;
  facility_id: string | null;
  risk_score: number;
  epoch: number;
  latency_ms: number;
  signals: Trace;
  decided_at: string;
};
export const DECISION_FIELDS = `id result reason policy_version_id grant_id override_id identity_id profile_id device_id
  access_point_id facility_id risk_score epoch latency_ms signals decided_at`;

export const checkAccess = (client: HasuraClient, args: Record<string, unknown>): Promise<Decision> =>
  callFn<Decision>(client, 'check_access', args, DECISION_FIELDS);

/** Publishes (submit by a, approve by approver) a version with one subject and one target; returns its id. */
export async function publishPolicy(
  w: AccessWorld,
  subject: Record<string, unknown>,
  target: Record<string, unknown>,
  version: Record<string, unknown> = {},
): Promise<{ policy: string; version: string }> {
  const { policy, draft } = await createPolicyWithDraft(w.a, subject, target, version);
  await publishVersion(w, draft.id);
  return { policy: policy.id, version: draft.id };
}

export async function insertGrant(w: AccessWorld, extra: Record<string, unknown> = {}): Promise<string> {
  const hour = (h: number): string => new Date(Date.now() + h * 3600_000).toISOString();
  const g = await insertOne(w.a, 'access_grants', {
    profile_id: w.profile,
    access_point_id: w.door.id,
    valid_from: hour(-1),
    valid_until: hour(2),
    reason: 'Engine test',
    ...extra,
  });
  return g.id;
}

/** Counts rows that a simulation must never write. */
export async function writeCounts(org: string): Promise<Record<string, number>> {
  const [row] = await runSqlRows(`select
      (select count(*) from itap.access_decisions where organization_id = '${org}') as decisions,
      (select count(*) from itap.events where organization_id = '${org}') as events,
      (select count(*) from itap.access_grants where organization_id = '${org}' and used_at is not null) as used_grants`);
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

export { accessWorld };
