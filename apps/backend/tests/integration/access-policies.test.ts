import { describe, expect, it } from 'vitest';
import {
  accessWorld,
  approveVersion,
  archivePolicy,
  createDraft,
  createPolicyWithDraft,
  publishVersion,
  rejectVersion,
  submitVersion,
  type AccessWorld,
} from './support/access.js';
import { asAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

const POLICY = `query($id: uuid!) { access_policies_by_pk(id: $id) { code is_archived current_version_id
  access_policy_versions(order_by: {version: asc}) { id version status effect priority
    access_policy_version_subjects { profile_id segment_id profile_type access_level }
    access_policy_version_targets { facility_id area_id access_point_id } } } }`;
type PolicyView = {
  code: string;
  is_archived: boolean;
  current_version_id: string | null;
  access_policy_versions: {
    id: string;
    version: number;
    status: string;
    effect: string;
    priority: number;
    access_policy_version_subjects: Record<string, string | null>[];
    access_policy_version_targets: Record<string, string | null>[];
  }[];
};

async function view(w: AccessWorld, id: string): Promise<PolicyView> {
  return (await w.a.request<{ access_policies_by_pk: PolicyView }>(POLICY, { id })).access_policies_by_pk;
}

const auditActions = async (version: string): Promise<string[]> =>
  (
    await runSqlRows(
      `select action || ':' || coalesce(user_id::text, '-') as a from itap.audit_log
       where entity = 'access_policy_versions' and entity_id = '${version}' and action in ('approve','publish','reject')
       order by occurred_at, action`,
    )
  ).map((r) => r.a ?? '');

const doorPolicy = (w: AccessWorld, version: Record<string, unknown> = {}) =>
  createPolicyWithDraft(w.a, { profile_id: w.profile }, { access_point_id: w.door.id }, version);

describe('access policies: versioning and approval', () => {
  it('should number policies POL-xxxxx and start with a draft version 1 holding its subject and target', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w, { effect: 'deny', priority: 500 });
    expect(policy.code).toMatch(/^POL-\d{5}$/);
    expect(draft).toMatchObject({ version: 1, status: 'draft', effect: 'deny', priority: 500, submitted_by: null });
    const v = await view(w, policy.id);
    expect(v.current_version_id).toBeNull();
    expect(v.access_policy_versions[0].access_policy_version_subjects).toEqual([
      { profile_id: w.profile, segment_id: null, profile_type: null, access_level: null },
    ]);
  });

  it('should require a different member to approve (four-eyes) and publish on approval with audit rows', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    const notPending = await expectError(approveVersion(w.approver, draft.id));
    expect(notPending.message).toContain('access_policy_version_not_pending');
    const submitted = await submitVersion(w.a, draft.id);
    expect(submitted).toMatchObject({ status: 'pending_approval', submitted_by: w.user.id });
    const self = await expectError(approveVersion(w.a, draft.id));
    expect(self.message).toContain('four_eyes_required');
    const published = await approveVersion(w.approver, draft.id);
    expect(published).toMatchObject({
      status: 'published',
      approved_by: w.approverUser.id,
      published_by: w.approverUser.id,
      submitted_by: w.user.id,
    });
    expect(published.approved_at).not.toBeNull();
    expect((await view(w, policy.id)).current_version_id).toBe(draft.id);
    expect(await auditActions(draft.id)).toEqual([`approve:${w.approverUser.id}`, `publish:${w.approverUser.id}`]);
  });

  it('should freeze a pending version (content and children) until it is rejected back to draft', async () => {
    const w = await accessWorld();
    const { draft } = await doorPolicy(w);
    await submitVersion(w.a, draft.id);
    const edit = await expectError(updateByPk(w.a, 'access_policy_versions', draft.id, { priority: 7 }));
    expect(edit.message).toContain('access_policy_version_pending');
    const child = await expectError(
      insertOne(w.a, 'access_policy_version_targets', { version_id: draft.id, area_id: w.area.id }),
    );
    expect(child.message).toContain('access_policy_version_pending');
    const twice = await expectError(submitVersion(w.a, draft.id));
    expect(twice.message).toContain('access_policy_version_not_draft');
    const blank = await expectError(rejectVersion(w.approver, draft.id, '  '));
    expect(blank.message).toContain('rejection_reason_required');
    const rejected = await rejectVersion(w.approver, draft.id, 'Too broad');
    expect(rejected).toMatchObject({ status: 'draft', rejection_reason: 'Too broad', submitted_by: null });
    expect(await auditActions(draft.id)).toEqual([`reject:${w.approverUser.id}`]);
    // Draft again: editable, and the cycle can repeat (submit clears the rejection).
    await updateByPk(w.a, 'access_policy_versions', draft.id, { priority: 7 });
    expect(await submitVersion(w.a, draft.id)).toMatchObject({ status: 'pending_approval', rejection_reason: null });
    expect(await approveVersion(w.approver, draft.id)).toMatchObject({ status: 'published', priority: 7 });
  });

  it('should refuse to submit a version without subjects or targets', async () => {
    const w = await accessWorld();
    const policy = await insertOne(w.a, 'access_policies', { name: 'Empty policy' });
    const draft = await createDraft(w.a, policy.id);
    const empty = await expectError(submitVersion(w.a, draft.id));
    expect(empty.message).toContain('access_policy_version_incomplete');
  });

  it('should keep status and approval columns read-only for org_admin', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    for (const column of ['status', 'submitted_by', 'approved_by', 'rejection_reason']) {
      await expectDenied(updateByPk(w.a, 'access_policy_versions', draft.id, { [column]: column === 'status' ? 'pending_approval' : null }), column);
    }
    await expectDenied(updateByPk(w.a, 'access_policies', policy.id, { current_version_id: null }), 'current_version_id');
    await expectDenied(updateByPk(w.a, 'access_policies', policy.id, { is_archived: true }), 'is_archived');
  });

  it('should roll back only through a new draft copied from a superseded version, approved again', async () => {
    const w = await accessWorld();
    const { policy, draft: v1 } = await doorPolicy(w, { priority: 10 });
    await publishVersion(w, v1.id);
    const v2 = await createDraft(w.a, policy.id);
    expect(v2).toMatchObject({ version: 2, priority: 10, submitted_by: null, approved_by: null, published_by: null });
    await updateByPk(w.a, 'access_policy_versions', v2.id, { priority: 20 });
    await publishVersion(w, v2.id);
    // No direct republish of the superseded version: approving it is refused.
    const direct = await expectError(approveVersion(w.approver, v1.id));
    expect(direct.message).toContain('access_policy_version_not_pending');
    const rollback = await createDraft(w.a, policy.id, v1.id);
    expect(rollback).toMatchObject({ version: 3, status: 'draft', priority: 10, approved_by: null });
    // Only one open version: a second copy is refused while v3 is open.
    const open = await expectError(createDraft(w.a, policy.id, v1.id));
    expect(open.message).toContain('version_open_exists');
    await publishVersion(w, rollback.id);
    const v = await view(w, policy.id);
    expect(v.access_policy_versions.map((x) => x.status)).toEqual(['superseded', 'superseded', 'published']);
    expect(v.access_policy_versions[2].access_policy_version_targets).toEqual(v.access_policy_versions[0].access_policy_version_targets);
    expect(v.current_version_id).toBe(rollback.id);
  });

  it('should archive a policy: clears current_version_id, blocks new drafts and approvals, is audited', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    await publishVersion(w, draft.id);
    const v2 = await createDraft(w.a, policy.id);
    await submitVersion(w.a, v2.id);
    expect(await archivePolicy(w.a, policy.id)).toEqual({ id: policy.id, is_archived: true, current_version_id: null });
    const approve = await expectError(approveVersion(w.approver, v2.id));
    expect(approve.message).toContain('access_policy_archived');
    const create = await expectError(createDraft(w.a, policy.id));
    expect(create.message).toContain('access_policy_archived');
    const again = await expectError(archivePolicy(w.a, policy.id));
    expect(again.message).toContain('access_policy_archived');
    const audit = await runSqlRows(
      `select user_id from itap.audit_log where entity = 'access_policies' and entity_id = '${policy.id}'
       and action = 'update' and changes ? 'is_archived'`,
    );
    expect(audit).toEqual([{ user_id: w.user.id }]);
  });

  it('should delete only drafts and only headers that are not enforced', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    const v1Delete = await deleteByPk(w.a, 'access_policy_versions', draft.id);
    expect(v1Delete).toEqual({ id: draft.id });
    const v1 = await createDraft(w.a, policy.id);
    await insertOne(w.a, 'access_policy_version_subjects', { version_id: v1.id, profile_type: 'employee' });
    await insertOne(w.a, 'access_policy_version_targets', { version_id: v1.id, facility_id: w.facility.id });
    await submitVersion(w.a, v1.id);
    expect(await deleteByPk(w.a, 'access_policy_versions', v1.id)).toBeNull();
    await approveVersion(w.approver, v1.id);
    expect(await deleteByPk(w.a, 'access_policies', policy.id)).toBeNull();
    await archivePolicy(w.a, policy.id);
    expect(await deleteByPk(w.a, 'access_policies', policy.id)).toEqual({ id: policy.id });
  });

  it('should keep functions inside the session organization', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    expect((await expectError(submitVersion(w.b, draft.id))).message).toContain('access_policy_version_not_found');
    expect((await expectError(createDraft(w.b, policy.id))).message).toContain('access_policy_not_found');
    expect((await expectError(archivePolicy(w.b, policy.id))).message).toContain('access_policy_not_found');
    const foreign = await w.b.request<{ access_policies: unknown[]; access_policy_versions: unknown[] }>(
      `query { access_policies { id } access_policy_versions { id } }`,
    );
    expect(foreign).toEqual({ access_policies: [], access_policy_versions: [] });
    const noOrg = await expectError(
      asAdmin().request(`mutation($v: uuid!) { submit_access_policy_version(args: {p_version: $v}) { id } }`, { v: draft.id }),
    );
    expect(`${noOrg.message} ${noOrg.detail ?? ''}`).toContain('organization_required');
  });
});
