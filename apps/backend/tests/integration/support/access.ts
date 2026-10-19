import type { HasuraClient } from '../../../src/hasura/client.js';
import { asOrgAdmin } from './clients.js';
import { createAccessPoint, createArea, createFacility } from './facilities.js';
import { addMember, createTestUser, createTwoOrgs } from './fixtures.js';
import { callFn, insertOne } from './operations.js';
import { runSql, runSqlRows } from './sql.js';

/** GraphQL / SQL helpers for physical access control (slice 8). */

export type PolicyVersion = {
  id: string;
  policy_id: string;
  version: number;
  status: string;
  effect: string;
  priority: number;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  published_by: string | null;
  published_at: string | null;
};
export const POLICY_VERSION_FIELDS = `id policy_id version status effect priority submitted_by submitted_at approved_by
  approved_at rejection_reason published_by published_at`;

/** Org A with an author (`a`) and a second admin (`approver`), a facility, an area, a door and a profile. */
export async function accessWorld() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const approverUser = await createTestUser();
  await addMember(orgA.id, approverUser.id);
  const a = asOrgAdmin(user.id, orgA.id);
  const approver = asOrgAdmin(approverUser.id, orgA.id);
  const b = asOrgAdmin(other.id, orgB.id);
  const facility = await createFacility(a);
  const area = await createArea(a, facility.id, 'Server room');
  const door = await createAccessPoint(a, facility.id, area.id);
  const profile = (await insertOne(a, 'profiles', { first_name: 'Ada', last_name: 'Access' })).id;
  return { orgA, orgB, user, other, approverUser, a, approver, b, facility, area, door, profile };
}
export type AccessWorld = Awaited<ReturnType<typeof accessWorld>>;

let counter = 0;

/** A policy header with one draft version (one subject, one target). */
export async function createPolicyWithDraft(
  client: HasuraClient,
  subject: Record<string, unknown>,
  target: Record<string, unknown>,
  version: Record<string, unknown> = {},
): Promise<{ policy: { id: string; code: string }; draft: PolicyVersion }> {
  counter += 1;
  const policy = await insertOne<{ id: string; code: string }>(
    client,
    'access_policies',
    { name: `Policy ${Date.now().toString(36)}-${counter}` },
    'id code',
  );
  const draft = await insertOne<PolicyVersion>(
    client,
    'access_policy_versions',
    {
      policy_id: policy.id,
      ...version,
      access_policy_version_subjects: { data: [subject] },
      access_policy_version_targets: { data: [target] },
    },
    POLICY_VERSION_FIELDS,
  );
  return { policy, draft };
}

const versionFn =
  (name: string) =>
  (client: HasuraClient, version: string, extra: Record<string, unknown> = {}): Promise<PolicyVersion> =>
    callFn<PolicyVersion>(client, name, { p_version: version, ...extra }, POLICY_VERSION_FIELDS);

export const submitVersion = versionFn('submit_access_policy_version');
export const approveVersion = versionFn('approve_access_policy_version');
export const rejectVersion = (client: HasuraClient, version: string, reason: string): Promise<PolicyVersion> =>
  versionFn('reject_access_policy_version')(client, version, { p_reason: reason });

export const createDraft = (client: HasuraClient, policy: string, fromVersion?: string): Promise<PolicyVersion> =>
  callFn<PolicyVersion>(
    client,
    'create_access_policy_draft',
    fromVersion ? { p_policy: policy, p_from_version: fromVersion } : { p_policy: policy },
    POLICY_VERSION_FIELDS,
  );

export const archivePolicy = (client: HasuraClient, policy: string) =>
  callFn<{ id: string; is_archived: boolean; current_version_id: string | null }>(
    client,
    'archive_access_policy',
    { p_policy: policy },
    'id is_archived current_version_id',
  );

/** Submit by `w.a`, approve by `w.approver`: the version is published. */
export async function publishVersion(w: AccessWorld, version: string): Promise<PolicyVersion> {
  await submitVersion(w.a, version);
  return approveVersion(w.approver, version);
}

export type Epoch = { epoch: number; urgent: number };

export async function policyEpoch(org: string): Promise<Epoch> {
  const [row] = await runSqlRows(
    `select policy_epoch, policy_urgent_epoch from itap.organization_settings where organization_id = '${org}'`,
  );
  return { epoch: Number(row.policy_epoch), urgent: Number(row.policy_urgent_epoch) };
}

/** Starts an override directly in SQL under the function flag (the start function arrives in task 4). */
export async function insertOverride(org: string, facility: string, mode: string): Promise<string> {
  const [row] = await runSqlRows(`select set_config('itap.override_context', 'on', true);
    insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, ends_at)
    values ('${org}', '${facility}', '${mode}', 'Fire alarm on floor 2', now() + interval '1 hour') returning id`);
  return row.id ?? '';
}

export async function endOverride(id: string): Promise<void> {
  await runSql(`select set_config('itap.override_context', 'on', true);
    update itap.emergency_overrides set ended_at = now() where id = '${id}'`);
}
