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
import { createAccessPoint, createFacility, createArea } from './support/facilities.js';
import { expectError } from './support/fixtures.js';
import { callFn, insertOne } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const doorPolicy = (w: AccessWorld) =>
  createPolicyWithDraft(w.a, { profile_id: w.profile }, { access_point_id: w.door.id });

const versionRows = async (policy: string) =>
  runSqlRows(`select version::text, status, rejection_reason from itap.access_policy_versions
    where policy_id = '${policy}' order by version`);

describe('access policies: SQL / admin bypass guards', () => {
  it('should refuse header writes of current_version_id / is_archived / archived_* outside the functions', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    await publishVersion(w, draft.id);
    const other = await doorPolicy(w);
    await publishVersion(w, other.draft.id);
    const admin = await expectError(
      asAdmin().request(`mutation($id: uuid!) { update_access_policies_by_pk(pk_columns: {id: $id}, _set: {current_version_id: null}) { id } }`, {
        id: policy.id,
      }),
    );
    expect(admin.message).toContain('access_policy_header_reserved');
    await expect(runSql(`update itap.access_policies set current_version_id = null where id = '${policy.id}'`)).rejects.toThrow(
      /access_policy_header_reserved/,
    );
    // Even under version_context the pointer must be a published version of this policy.
    await expect(
      runSql(`select set_config('itap.version_context', 'on', true);
        update itap.access_policies set current_version_id = '${other.draft.id}' where id = '${policy.id}'`),
    ).rejects.toThrow(/access_policy_header_reserved/);
    await expect(
      runSql(`update itap.access_policies set is_archived = true, archived_at = now(), current_version_id = null where id = '${policy.id}'`),
    ).rejects.toThrow(/access_policy_header_reserved/);
    await expect(runSql(`update itap.access_policies set archived_at = now() where id = '${policy.id}'`)).rejects.toThrow(
      /access_policy_header_reserved/,
    );
    // Name / description stay editable.
    await runSql(`update itap.access_policies set description = 'Server room door' where id = '${policy.id}'`);
  });

  it('should refuse any publish without the approval functions (SQL publish_version / status writes)', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    await publishVersion(w, draft.id);
    const v2 = await createDraft(w.a, policy.id);
    await publishVersion(w, v2.id);
    // Direct republish (rollback) of the approved, superseded v1 from SQL.
    await expect(
      runSql(`select itap.publish_version('itap.access_policy_versions', 'itap.access_policies', 'policy_id',
        '${w.orgA.id}', '${draft.id}', '${w.user.id}')`),
    ).rejects.toThrow(/version_status_reserved/);
    await expect(
      runSql(`select set_config('itap.version_context', 'on', true);
        update itap.access_policy_versions set status = 'published' where id = '${draft.id}'`),
    ).rejects.toThrow(/version_status_reserved/);
    expect((await versionRows(policy.id)).map((r) => r.status)).toEqual(['superseded', 'published']);
  });

  it('should supersede the enforced version and reject the pending one on archive', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    await publishVersion(w, draft.id);
    const v2 = await createDraft(w.a, policy.id);
    await submitVersion(w.a, v2.id);
    await archivePolicy(w.a, policy.id);
    expect(await versionRows(policy.id)).toEqual([
      { version: '1', status: 'superseded', rejection_reason: 'NULL' },
      { version: '2', status: 'draft', rejection_reason: 'policy_archived' },
    ]);
    const audit = await runSqlRows(`select action, reason from itap.audit_log where entity = 'access_policy_versions'
      and entity_id = '${v2.id}' and action = 'reject'`);
    expect(audit).toEqual([{ action: 'reject', reason: 'policy_archived' }]);
  });

  it('should require an active member to revoke a grant', async () => {
    const w = await accessWorld();
    const grant = await insertOne(w.a, 'access_grants', {
      profile_id: w.profile,
      access_point_id: w.door.id,
      valid_from: new Date(Date.now() - 3600_000).toISOString(),
      valid_until: new Date(Date.now() + 3600_000).toISOString(),
    });
    await runSql(`update itap.organization_members set status = 'suspended' where organization_id = '${w.orgA.id}'
      and user_id = '${w.user.id}'`);
    const e = await expectError(callFn(w.a, 'revoke_access_grant', { p_grant: grant.id, p_reason: 'x' }, 'id'));
    expect(e.message).toContain('member_required');
  });

  it('should require an active, unexpired member for every policy lifecycle function', async () => {
    const w = await accessWorld();
    const { policy, draft } = await doorPolicy(w);
    const setMember = (user: string, sql: string) =>
      runSql(`update itap.organization_members set ${sql} where organization_id = '${w.orgA.id}' and user_id = '${user}'`);
    const denied = async (call: Promise<unknown>) => expect((await expectError(call)).message).toContain('member_required');
    await setMember(w.user.id, `status = 'suspended'`);
    await denied(submitVersion(w.a, draft.id));
    await denied(createDraft(w.a, policy.id));
    await denied(archivePolicy(w.a, policy.id));
    await setMember(w.user.id, `status = 'active'`);
    await submitVersion(w.a, draft.id);
    // An expired approver can neither approve nor reject (previously only membership existence was checked).
    await setMember(w.approverUser.id, `expires_at = now() - interval '1 minute'`);
    await denied(approveVersion(w.approver, draft.id));
    await denied(rejectVersion(w.approver, draft.id, 'Too broad'));
    await setMember(w.approverUser.id, `expires_at = null`);
    expect((await approveVersion(w.approver, draft.id)).status).toBe('published');
  });

  it('should delete an access point and its facility while decisions keep their rows', async () => {
    const w = await accessWorld();
    const facility = await createFacility(w.a);
    const area = await createArea(w.a, facility.id, 'Gate area');
    const gate = await createAccessPoint(w.a, facility.id, area.id);
    const [d] = await runSqlRows(`insert into itap.access_decisions (organization_id, facility_id, access_point_id, result,
      reason, epoch) values ('${w.orgA.id}', '${facility.id}', '${gate.id}', 'denied', 'no_rule', 0) returning id`);
    await runSql(`delete from itap.access_points where id = '${gate.id}'`);
    await runSql(`delete from itap.areas where id = '${area.id}'`);
    await runSql(`delete from itap.facilities where id = '${facility.id}'`);
    const [row] = await runSqlRows(`select facility_id, access_point_id from itap.access_decisions where id = '${d.id}'`);
    expect(row).toEqual({ facility_id: 'NULL', access_point_id: 'NULL' });
  });
});
