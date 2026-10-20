import { describe, expect, it } from 'vitest';
import { asOrgAdmin, orgAdminToken } from './support/clients.js';
import { sqlValue } from './support/compliance.js';
import { createFacility } from './support/facilities.js';
import { createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import { deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

const POLICY = 'id data_class facility_id retain_days action is_active created_by';

describe('retention_policies', () => {
  it('should validate class, facility dimension, action and retain_days, one active policy per scope', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const facility = await createFacility(a);
    const orgWide = await insertOne(a, 'retention_policies', { data_class: 'detections', retain_days: 90, action: 'delete' }, POLICY);
    expect(orgWide).toMatchObject({ facility_id: null, is_active: true, created_by: user.id });
    // Facility-specific next to the org-wide one.
    await insertOne(a, 'retention_policies', { data_class: 'detections', facility_id: facility.id, retain_days: 30, action: 'anonymize' });
    // A second active policy for the same scope is refused; an inactive one is fine.
    expect((await expectError(insertOne(a, 'retention_policies', { data_class: 'detections', retain_days: 60, action: 'delete' }))).message).toMatch(
      /Uniqueness violation|retention_policies_active_scope_key/,
    );
    await insertOne(a, 'retention_policies', { data_class: 'detections', retain_days: 60, action: 'delete', is_active: false });
    // Classes without a facility dimension refuse facility_id.
    expect((await expectError(insertOne(a, 'retention_policies', { data_class: 'audit', facility_id: facility.id, retain_days: 400, action: 'delete' }))).message).toMatch(
      /retention_policies_facility_dimension/,
    );
    // Action must be valid for the class.
    expect((await expectError(insertOne(a, 'retention_policies', { data_class: 'photos', retain_days: 30, action: 'anonymize' }))).message).toMatch(
      /retention_policies_action_valid/,
    );
    expect((await expectError(insertOne(a, 'retention_policies', { data_class: 'detections', retain_days: 30, action: 'archive', is_active: false }))).message).toMatch(
      /retention_policies_action_valid/,
    );
    await insertOne(a, 'retention_policies', { data_class: 'reports', retain_days: 180, action: 'archive' });
    expect((await expectError(insertOne(a, 'retention_policies', { data_class: 'events', retain_days: 0, action: 'delete' }))).message).toMatch(
      /retention_policies_retain_days/,
    );
  });

  it('should know every data class (delete always allowed) and list the facility classes', async () => {
    const unknown = await runSqlRows(`select value from itap.retention_data_classes where not itap.retention_action_allowed(value, 'delete')`);
    expect(unknown).toEqual([]);
    const facility = await runSqlRows(
      `select value from itap.retention_data_classes where itap.retention_class_has_facility(value) order by value`,
    );
    expect(facility.map((r) => r.value)).toEqual(['access_decisions', 'detections', 'events', 'incidents', 'locations', 'sessions', 'stats', 'terminal_syncs']);
  });

  it('should keep another organization out (facility and rows)', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(other.id, orgB.id);
    const facilityB = await createFacility(b);
    await expectError(insertOne(a, 'retention_policies', { data_class: 'events', facility_id: facilityB.id, retain_days: 30, action: 'delete' }));
    const policy = await insertOne(a, 'retention_policies', { data_class: 'events', retain_days: 30, action: 'delete' });
    expect(await updateByPk(b, 'retention_policies', policy.id, { retain_days: 1 })).toBeNull();
  });
});

describe('data_subject_requests', () => {
  it('should default due_at to received_at + 30 days, stamp requested_by and keep job columns read-only', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const dsr = await insertOne<Record<string, unknown>>(
      a,
      'data_subject_requests',
      { profile_id: profile, request_type: 'access', received_at: '2026-10-01T10:00:00Z', notes: 'By email' },
      'id code status received_at due_at completed_at requested_by attempts',
    );
    expect(dsr).toMatchObject({ status: 'received', requested_by: user.id, attempts: 0, completed_at: null });
    expect(String(dsr.code)).toMatch(/^DSR-\d{5}$/);
    expect(new Date(String(dsr.due_at)).toISOString()).toBe('2026-10-31T10:00:00.000Z');
    await updateByPk(a, 'data_subject_requests', String(dsr.id), { notes: 'Identity verified' });
    await expectDenied(updateByPk(a, 'data_subject_requests', String(dsr.id), { status: 'completed' }), 'status');
    await expectDenied(insertOne(a, 'data_subject_requests', { profile_id: profile, request_type: 'erasure', status: 'completed' }), 'status');
    await expectDenied(deleteByPk(a, 'data_subject_requests', String(dsr.id)), 'delete_data_subject_requests_by_pk');
    // Explicit due_at within the extension limit; beyond it refused.
    const extended = await insertOne<{ due_at: string }>(
      a, 'data_subject_requests',
      { profile_id: profile, request_type: 'erasure', received_at: '2026-10-01T00:00:00Z', due_at: '2026-12-01T00:00:00Z' }, 'due_at',
    );
    expect(new Date(extended.due_at).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect((await expectError(insertOne(a, 'data_subject_requests', { profile_id: profile, request_type: 'erasure', received_at: '2026-10-01T00:00:00Z', due_at: '2027-02-01T00:00:00Z' }))).message).toMatch(
      /data_subject_requests_due_window/,
    );
    // Another organization's profile, and another organization's view.
    const b = asOrgAdmin(other.id, orgB.id);
    await expectError(insertOne(b, 'data_subject_requests', { profile_id: profile, request_type: 'access' }));
    const seen = await b.request<{ data_subject_requests: unknown[] }>(`{ data_subject_requests { id } }`);
    expect(seen.data_subject_requests).toEqual([]);
    // Terminal states are guarded for every writer; steps are a read-only log.
    await runSql(`update itap.data_subject_requests set status = 'rejected', rejection_reason = 'Identity not verified',
                  completed_at = now() where id = '${String(dsr.id)}'`);
    await expect(runSql(`update itap.data_subject_requests set status = 'in_progress' where id = '${String(dsr.id)}'`)).rejects.toThrow(
      /dsr_invalid_transition/,
    );
    await expectDenied(insertOne(a, 'dsr_steps', { request_id: dsr.id, step: 'x' }), 'insert_dsr_steps_one');
  });
});

describe('integrations', () => {
  it('should never expose the secret and keep system columns read-only', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const integration = await insertOne<{ id: string; code: string; status: string }>(
      a, 'integrations',
      { name: 'HR feed', kind: 'hr', provider: 'fixture', direction: 'inbound', config: { file: 'hr.json' } },
      'id code status',
    );
    expect(integration.code).toMatch(/^INT-\d{5}$/);
    expect(integration.status).toBe('active');
    await expectDenied(a.request(`{ integrations { id secret } }`), 'secret');
    await expectDenied(updateByPk(a, 'integrations', integration.id, { last_error: 'x' }), 'last_error');
  });

  it('should reference profiles.source_integration_id with a composite FK that nulls on delete', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const own = await insertOne(a, 'integrations', { name: 'HR', kind: 'hr', provider: 'fixture' });
    const foreign = await insertOne(asOrgAdmin(other.id, orgB.id), 'integrations', { name: 'HR', kind: 'hr', provider: 'fixture' });
    await expect(runSql(`update itap.profiles set source_integration_id = '${foreign.id}' where id = '${profile}'`)).rejects.toThrow(
      /profiles_source_integration_fkey/,
    );
    await runSql(`update itap.profiles set source_integration_id = '${own.id}', external_id = 'E-1' where id = '${profile}'`);
    await deleteByPk(a, 'integrations', own.id);
    expect(await sqlValue(`select source_integration_id from itap.profiles where id = '${profile}'`)).toBeNull();
  });
});

describe('processing activities and system tables', () => {
  it('should store data classes, require a dpia-kind file and hide system tables', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const token = orgAdminToken(user.id, orgA.id);
    const dpia = await uploadFile(token, orgA.id, { kind: 'dpia' });
    const other = await uploadFile(token, orgA.id, { kind: 'misc' });
    if (!('id' in dpia) || !('id' in other)) throw new Error('upload failed');
    const activity = await insertOne<{ id: string; code: string; dpia_status: string }>(
      a, 'processing_activities',
      {
        name: 'Access control', purpose: 'Building security', legal_basis: 'legitimate_interests', owner_id: user.id,
        dpia_status: 'approved', dpia_file_id: dpia.id,
        data_classes: { data: [{ data_class: 'detections' }, { data_class: 'access_decisions' }] },
      },
      'id code dpia_status',
    );
    expect(activity.code).toMatch(/^PA-\d{5}$/);
    expect((await expectError(updateByPk(a, 'processing_activities', activity.id, { dpia_file_id: other.id }))).message).toMatch(
      /file_kind_mismatch:dpia_file_id/,
    );
    const classes = await runSqlRows(`select data_class from itap.processing_activity_data_classes where activity_id = '${activity.id}' order by 1`);
    expect(classes.map((r) => r.data_class)).toEqual(['access_decisions', 'detections']);
    await expectDenied(insertOne(a, 'retention_runs', { dry_run: true }), 'insert_retention_runs_one');
    await expectDenied(a.request(`{ pending_file_deletions { id } }`), 'pending_file_deletions');
    await a.request(`{ retention_runs { id } retention_run_classes { id } dsr_steps { id } }`);
  });
});
