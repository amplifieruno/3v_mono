import type { HasuraClient } from '../hasura/client.js';
import {
  FACILITY_POLICY,
  LEGAL_HOLDS,
  PROCESSING_ACTIVITIES,
  RETENTION_CRON_MINUTES_UTC,
  RETENTION_HISTORY_DAYS,
  RETENTION_POLICIES,
  type ProcessingActivitySpec,
  type RetentionPolicySpec,
} from './compliancePlan.js';
import { renderPdf } from './pdf.js';
import type { SeedContext } from './tenancy.js';

/**
 * Compliance configuration of Nova Tower (slice 10): retention policies, records of processing activities (with DPIA
 * PDFs, file kind `dpia`), legal holds (an incident and a profile) — inserted with the Nova Tower admin's org_admin
 * session (permissions and created_by stamping apply), keyed by class / name — and the retention run history: past
 * daily runs through the real runner itap.run_retention at past cron times (cutoffs before the demo history: nothing
 * affected), back-dated to their scheduled time when just created.
 */
export type ComplianceConfigResult = { policies: number; activities: number; holds: number; retentionRuns: number };

const iso = (ms: number): string => new Date(ms).toISOString();
const DAY_MS = 86_400_000;

const POLICIES = `
  query SeedRetentionPolicies($org: uuid!) {
    retention_policies(where: { organization_id: { _eq: $org }, is_active: { _eq: true } }) { id data_class facility_id }
  }
`;
const INSERT_POLICIES = `
  mutation SeedInsertRetentionPolicies($objects: [retention_policies_insert_input!]!) {
    insert_retention_policies(objects: $objects) { affected_rows }
  }
`;
const ACTIVITIES = `query SeedActivities($org: uuid!) { processing_activities(where: { organization_id: { _eq: $org } }) { name } }`;
const INSERT_ACTIVITY = `
  mutation SeedInsertActivity($object: processing_activities_insert_input!) { insert_processing_activities_one(object: $object) { id } }
`;
const HOLDS = `query SeedHolds($org: uuid!) { legal_holds(where: { organization_id: { _eq: $org } }) { name } }`;
const HOLD_SUBJECTS = `
  query SeedHoldSubjects($org: uuid!) {
    incidents(where: { organization_id: { _eq: $org }, severity: { _eq: critical } }, order_by: { created_at: asc }) {
      id status
    }
    profiles(where: { organization_id: { _eq: $org }, status: { _eq: terminated }, external_id: { _like: "seed:%" } }, order_by: { external_id: asc }, limit: 1) {
      id
    }
  }
`;
const INSERT_HOLD = `mutation SeedInsertHold($object: legal_holds_insert_input!) { insert_legal_holds_one(object: $object) { id } }`;
const RUN = `
  mutation SeedRetentionRun($org: uuid!, $at: timestamptz!) {
    run_retention(args: { p_organization: $org, p_at: $at }) { id status scheduled_at started_at finished_at }
  }
`;
const BACKDATE_RUN = `
  mutation SeedBackdateRetentionRun($id: uuid!, $started: timestamptz!, $finished: timestamptz!) {
    update_retention_runs_by_pk(pk_columns: { id: $id }, _set: { started_at: $started, finished_at: $finished, created_at: $started }) { id }
    update_retention_run_classes(where: { run_id: { _eq: $id } }, _set: { created_at: $started, completed_at: $finished }) { affected_rows }
  }
`;

type Run = { id: string; status: string; scheduled_at: string; started_at: string; finished_at: string | null };

/** Retention policies (org-wide defaults + the facility policy) that are missing. Returns the org-wide ids by class. */
async function seedPolicies(ctx: SeedContext, owner: HasuraClient, org: string, facility: string): Promise<Map<string, string>> {
  type Row = { id: string; data_class: string; facility_id: string | null };
  const read = async () => (await ctx.admin.request<{ retention_policies: Row[] }>(POLICIES, { org })).retention_policies;
  const existing = await read();
  const has = (dataClass: string, facilityId: string | null) => existing.some((p) => p.data_class === dataClass && p.facility_id === facilityId);
  const object = (p: RetentionPolicySpec, facilityId: string | null): Record<string, unknown> => ({
    data_class: p.dataClass, retain_days: p.retainDays, action: p.action, description: p.description, facility_id: facilityId,
  });
  const objects = RETENTION_POLICIES.filter((p) => !has(p.dataClass, null)).map((p) => object(p, null));
  if (!has(FACILITY_POLICY.dataClass, facility)) objects.push(object(FACILITY_POLICY, facility));
  if (objects.length > 0) await owner.request(INSERT_POLICIES, { objects });
  return new Map((await read()).filter((p) => p.facility_id === null).map((p) => [p.data_class, p.id]));
}

async function dpiaFile(ctx: SeedContext, org: string, spec: ProcessingActivitySpec): Promise<string | null> {
  if (!spec.dpia) return null;
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const { id } = await ctx.storage.upload({
    bucketId: org,
    name: `dpia-${slug}.pdf`,
    mimeType: 'application/pdf',
    data: renderPdf(spec.dpia),
    metadata: { kind: 'dpia' },
  });
  return id;
}

async function seedActivities(ctx: SeedContext, owner: HasuraClient, org: string, ownerId: string, policies: Map<string, string>): Promise<number> {
  const { processing_activities: rows } = await ctx.admin.request<{ processing_activities: { name: string }[] }>(ACTIVITIES, { org });
  const names = new Set(rows.map((r) => r.name));
  let created = 0;
  for (const spec of PROCESSING_ACTIVITIES) {
    if (names.has(spec.name)) continue;
    await owner.request(INSERT_ACTIVITY, {
      object: {
        name: spec.name,
        purpose: spec.purpose,
        legal_basis: spec.legalBasis,
        description: spec.description,
        retention_policy_id: policies.get(spec.policyClass) ?? null,
        dpia_status: spec.dpiaStatus,
        dpia_file_id: await dpiaFile(ctx, org, spec),
        owner_id: ownerId,
        data_classes: { data: spec.dataClasses.map((data_class) => ({ data_class })) },
      },
    });
    created += 1;
  }
  return created;
}

async function seedHolds(ctx: SeedContext, owner: HasuraClient, org: string): Promise<number> {
  const { legal_holds: rows } = await ctx.admin.request<{ legal_holds: { name: string }[] }>(HOLDS, { org });
  const names = new Set(rows.map((r) => r.name));
  const missing = LEGAL_HOLDS.filter((h) => !names.has(h.name));
  if (missing.length === 0) return 0;
  const subjects = await ctx.admin.request<{ incidents: { id: string; status: string }[]; profiles: { id: string }[] }>(HOLD_SUBJECTS, { org });
  // A resolved / closed critical incident first (the one retention would otherwise anonymize), else any critical one.
  const incident = subjects.incidents.find((i) => i.status === 'resolved' || i.status === 'closed') ?? subjects.incidents[0];
  const targets = { incident: incident ? { incident_id: incident.id } : null, profile: subjects.profiles[0] ? { profile_id: subjects.profiles[0].id } : null };
  for (const hold of missing) {
    const target = targets[hold.target];
    if (!target) throw new Error(`seed: no ${hold.target} for the legal hold "${hold.name}"`);
    await owner.request(INSERT_HOLD, {
      object: { name: hold.name, reason: hold.reason, starts_at: iso(ctx.now.getTime() - hold.daysAgo * DAY_MS), targets: { data: [target] } },
    });
  }
  return missing.length;
}

/** Past daily runs of retention_cleanup (03:30 UTC) through itap.run_retention; returns the runs created now. */
async function seedRetentionHistory(ctx: SeedContext, org: string): Promise<number> {
  const today = Math.floor(ctx.now.getTime() / DAY_MS) * DAY_MS;
  let created = 0;
  for (let k = RETENTION_HISTORY_DAYS; k >= 1; k -= 1) {
    const at = today - k * DAY_MS + RETENTION_CRON_MINUTES_UTC * 60_000;
    const { run_retention: runs } = await ctx.admin.request<{ run_retention: Run[] }>(RUN, { org, at: iso(at) });
    const run = runs[0];
    if (!run || run.status !== 'completed') throw new Error(`seed: retention run at ${iso(at)} ended ${run?.status ?? 'without a run'}`);
    const started = Date.parse(run.started_at);
    if (started - at < 3_600_000) continue; // already back-dated by an earlier seed run
    const took = Math.max(400, Date.parse(run.finished_at ?? run.started_at) - started);
    const start = at + 2_000 + (k % 3) * 700;
    await ctx.admin.request(BACKDATE_RUN, { id: run.id, started: iso(start), finished: iso(start + took) });
    created += 1;
  }
  return created;
}

export async function seedComplianceConfig(
  ctx: SeedContext,
  args: { org: string; owner: HasuraClient; ownerId: string; facility: string },
): Promise<ComplianceConfigResult> {
  const policies = await seedPolicies(ctx, args.owner, args.org, args.facility);
  const activities = await seedActivities(ctx, args.owner, args.org, args.ownerId, policies);
  const holds = await seedHolds(ctx, args.owner, args.org);
  const retentionRuns = await seedRetentionHistory(ctx, args.org);
  return { policies: policies.size + 1, activities, holds, retentionRuns };
}
