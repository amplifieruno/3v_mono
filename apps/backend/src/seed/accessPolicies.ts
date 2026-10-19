import { randomUUID } from 'node:crypto';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import type { PolicySpec, SubjectRef, TargetRef } from './accessPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Writes access policies through the real lifecycle (slice 8): the author inserts the header and a draft version with
 * its subjects and targets (org_admin CRUD), submits it (submit_access_policy_version) and a second member approves it
 * (approve_access_policy_version: four-eyes, publishes). Keyed by name and resumable: an existing policy is moved on
 * to the stage its spec asks for (a draft submitted, a pending version approved), nothing is written otherwise.
 */
export type PolicyRefs = {
  accessPoints: Map<string, string>;
  areas: (path: string) => string;
  facility: string;
  segments: Map<string, string>;
  /** Profile ids of the groups a subject may name. */
  groups: { operations: string[] };
};

export type PolicyActors = { author: string; approver: string; pendingAuthor: string };

type VersionRow = { id: string; status: string; submitted_at: string | null };
type PolicyRow = { id: string; name: string; current_version_id: string | null; access_policy_versions: VersionRow[] };

const POLICIES = `
  query SeedAccessPolicies($org: uuid!) {
    access_policies(where: { organization_id: { _eq: $org } }) {
      id name current_version_id
      access_policy_versions(order_by: { version: desc }) { id status submitted_at }
    }
  }
`;
const INSERT = `
  mutation SeedAccessPolicy($policy: access_policies_insert_input!, $version: access_policy_versions_insert_input!) {
    policy: insert_access_policies_one(object: $policy) { id }
    version: insert_access_policy_versions_one(object: $version) { id }
  }
`;
const SUBMIT = `mutation SeedSubmitPolicy($v: uuid!) { submit_access_policy_version(args: { p_version: $v }) { id status } }`;
const APPROVE = `mutation SeedApprovePolicy($v: uuid!) { approve_access_policy_version(args: { p_version: $v }) { id status } }`;

function need(id: string | undefined, what: string): string {
  if (!id) throw new Error(`seed: access policy needs ${what}`);
  return id;
}

function subjectRows(subject: SubjectRef, refs: PolicyRefs): Record<string, string>[] {
  if ('group' in subject) {
    const ids = refs.groups[subject.group];
    if (ids.length === 0) throw new Error(`seed: access policy group ${subject.group} is empty`);
    return ids.map((profile_id) => ({ profile_id }));
  }
  if ('segment' in subject) return [{ segment_id: need(refs.segments.get(subject.segment), `segment ${subject.segment}`) }];
  return [subject];
}

function targetRow(target: TargetRef, refs: PolicyRefs): Record<string, string> {
  if ('access_point' in target) return { access_point_id: need(refs.accessPoints.get(target.access_point), `access point ${target.access_point}`) };
  if ('area' in target) return { area_id: refs.areas(target.area) };
  return { facility_id: refs.facility };
}

/** Creates the missing policies and moves existing ones on to their stage; returns how many were created. */
export async function ensurePolicies(
  ctx: SeedContext,
  args: { org: string; specs: PolicySpec[]; refs: PolicyRefs; actors: PolicyActors; validFrom: number },
): Promise<number> {
  const { org, refs, actors } = args;
  const as = (user: string): HasuraClient => createHasuraClient(ctx.env, { role: 'admin', userId: user, organizationId: org });
  const { access_policies: existing } = await ctx.admin.request<{ access_policies: PolicyRow[] }>(POLICIES, { org });
  const byName = new Map(existing.map((p) => [p.name, p]));
  const created = new Date(args.validFrom).toISOString();
  let count = 0;
  for (const spec of args.specs) {
    const author = spec.stage === 'pending' ? actors.pendingAuthor : actors.author;
    const row = byName.get(spec.name);
    let version: VersionRow | undefined = row?.access_policy_versions[0];
    if (!row) {
      // Header and version in one request: the version needs the header id, so the header id is chosen here.
      const policyId = randomUUID();
      const data = await as(author).request<{ version: { id: string } }>(INSERT, {
        policy: { id: policyId, organization_id: org, name: spec.name, description: spec.description, created_at: created },
        version: {
          organization_id: org,
          policy_id: policyId,
          effect: spec.effect,
          priority: spec.priority,
          schedule: spec.schedule,
          valid_from: created,
          max_risk: spec.maxRisk,
          created_at: created,
          access_policy_version_subjects: {
            data: spec.subjects.flatMap((s) => subjectRows(s, refs)).map((s) => ({ created_at: created, ...s })),
          },
          access_policy_version_targets: {
            data: spec.targets.map((t) => ({ created_at: created, ...targetRow(t, refs) })),
          },
        },
      });
      version = { id: data.version.id, status: 'draft', submitted_at: null };
      count += 1;
    }
    if (!version) continue;
    if (spec.stage !== 'draft' && version.status === 'draft' && version.submitted_at === null) {
      await as(author).request(SUBMIT, { v: version.id });
      version = { ...version, status: 'pending_approval' };
    }
    if (spec.stage === 'published' && version.status === 'pending_approval') await as(actors.approver).request(APPROVE, { v: version.id });
  }
  return count;
}
