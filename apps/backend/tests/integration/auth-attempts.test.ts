import { describe, expect, it } from 'vitest';
import { authWorld, createApp, insertAttempt, insertSession } from './support/authService.js';
import { addMember, createTestUser, expectDenied, expectError } from './support/fixtures.js';
import { asOrgAdmin } from './support/clients.js';
import { callFn, updateByPk } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const ATTEMPT_FIELDS = 'id review_status reviewed_by reviewed_at review_note outcome session_id';
type Reviewed = { id: string; review_status: string; reviewed_by: string | null; review_note: string | null };

const review = (client: Parameters<typeof callFn>[0], attempt: string, approve: boolean, note?: string): Promise<Reviewed> =>
  callFn<Reviewed>(client, 'review_authentication_attempt', { p_attempt: attempt, p_approve: approve, p_note: note }, ATTEMPT_FIELDS);

const sessionRow = async (id: string): Promise<Record<string, string | null>> =>
  (await runSqlRows(`select status, closed_at from itap.authentication_sessions where id = '${id}'`))[0];

describe('authentication sessions and attempts', () => {
  it('should expose sessions and attempts read-only to org_admin, without the nonce hash', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const session = await insertSession(w.orgA.id, app.id);
    const attempt = await insertAttempt(w.orgA.id, app.id, session);
    const data = await w.a.request<{ authentication_attempts: { id: string }[]; authentication_sessions: { id: string }[] }>(
      `{ authentication_attempts { id outcome population_scope evidence_file_id sequence_digest retrieval_ms comparison_ms }
         authentication_sessions { id status step step_count expires_at } }`,
    );
    expect(data.authentication_attempts.map((r) => r.id)).toEqual([attempt]);
    expect(data.authentication_sessions.map((r) => r.id)).toEqual([session]);
    await expectDenied(w.a.request(`{ authentication_sessions { nonce_hash } }`), 'nonce_hash');
    await expectDenied(updateByPk(w.a, 'authentication_attempts', attempt, { outcome: 'success' }), 'update_authentication_attempts_by_pk');
    await expectDenied(
      w.a.request(`mutation { insert_authentication_sessions_one(object: {}) { id } }`),
      'insert_authentication_sessions_one',
    );
    const other = await w.b.request<{ authentication_attempts: unknown[] }>(`{ authentication_attempts { id } }`);
    expect(other.authentication_attempts).toEqual([]);
    // Internal tables are not exposed at all.
    await expectDenied(w.a.request(`{ identity_centroids { identity_id } }`), 'identity_centroids');
    await expectDenied(w.a.request(`{ auth_sequence_digests { digest } }`), 'auth_sequence_digests');
  });

  it('should keep attempts append-only and check the outcome shape and evidence file', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const session = await insertSession(w.orgA.id, app.id);
    const attempt = await insertAttempt(w.orgA.id, app.id, session);
    await expect(runSql(`update itap.authentication_attempts set confidence = 0.99 where id = '${attempt}'`)).rejects.toThrow(
      /authentication_attempt_immutable/,
    );
    await expect(insertAttempt(w.orgA.id, app.id, session, { outcome: 'failure', failure_reason: null })).rejects.toThrow(
      /authentication_attempts_failure_reason/,
    );
    await expect(
      insertAttempt(w.orgA.id, app.id, session, { outcome: 'success', failure_reason: 'blur', review_status: 'none' }),
    ).rejects.toThrow(/authentication_attempts_failure_reason/);
    await expect(insertAttempt(w.orgA.id, app.id, session, { outcome: 'success', failure_reason: null })).rejects.toThrow(
      /authentication_attempts_review_status/,
    );
    const [plain] = await runSqlRows(
      `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded) values ('${w.orgA.id}', 'x.jpg', 'image/jpeg', 1, true) returning id`,
    );
    await expect(insertAttempt(w.orgA.id, app.id, session, { evidence_file_id: plain.id })).rejects.toThrow(/auth_evidence_kind/);
    const [foreign] = await runSqlRows(
      `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded, metadata)
       values ('${w.orgB.id}', 'x.jpg', 'image/jpeg', 1, true, '{"kind":"auth_capture"}') returning id`,
    );
    await expect(insertAttempt(w.orgA.id, app.id, session, { evidence_file_id: foreign.id })).rejects.toThrow(/file_not_in_org_bucket/);
    const [evidence] = await runSqlRows(
      `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded, metadata)
       values ('${w.orgA.id}', 'x.jpg', 'image/jpeg', 1, true, '{"kind":"auth_capture"}') returning id`,
    );
    await insertAttempt(w.orgA.id, app.id, session, { attempt_no: 2, step: 'recapture', evidence_file_id: evidence.id });
    // Sequence digests are unique per organization.
    await runSql(`insert into itap.auth_sequence_digests (organization_id, digest, attempt_id) values ('${w.orgA.id}', 'd1', '${attempt}')`);
    await expect(
      runSql(`insert into itap.auth_sequence_digests (organization_id, digest) values ('${w.orgA.id}', 'd1')`),
    ).rejects.toThrow(/auth_sequence_digests_digest_key/);
    await runSql(`insert into itap.auth_sequence_digests (organization_id, digest) values ('${w.orgB.id}', 'd1')`);
  });

  it('should have the attempt search indexes', async () => {
    const rows = await runSqlRows(
      `select indexdef from pg_indexes where schemaname = 'itap' and tablename = 'authentication_attempts'`,
    );
    const defs = rows.map((r) => String(r.indexdef));
    for (const cols of [
      'organization_id, application_id, attempted_at',
      'organization_id, matched_identity_id, attempted_at',
      'organization_id, session_id',
      'organization_id, outcome, attempted_at',
    ]) {
      expect(defs.some((d) => d.includes(`(${cols}`)), cols).toBe(true);
    }
  });
});

describe('review_authentication_attempt', () => {
  it('should approve a pending attempt, close the session as succeeded and audit the approval', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const session = await insertSession(w.orgA.id, app.id, { status: 'review' });
    const attempt = await insertAttempt(w.orgA.id, app.id, session);
    const r = await review(w.a, attempt, true, 'Matches the badge photo');
    expect(r).toMatchObject({ review_status: 'approved', reviewed_by: w.user.id, review_note: 'Matches the badge photo' });
    const s = await sessionRow(session);
    expect(s.status).toBe('succeeded');
    expect(s.closed_at).not.toBe('NULL');
    const audit = await runSqlRows(
      `select action, user_id from itap.audit_log where entity = 'authentication_attempts' and entity_id = '${attempt}'`,
    );
    expect(audit).toEqual([{ action: 'approve', user_id: w.user.id }]);
    const again = await expectError(review(w.a, attempt, false));
    expect(again.message).toContain('auth_attempt_not_pending');
  });

  it('should reject a pending attempt and fail the session; refuse foreign, non-pending and inactive callers', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const session = await insertSession(w.orgA.id, app.id);
    const attempt = await insertAttempt(w.orgA.id, app.id, session);
    const foreign = await expectError(review(w.b, attempt, true));
    expect(foreign.message).toContain('auth_attempt_not_found');
    const suspendedUser = await createTestUser();
    await addMember(w.orgA.id, suspendedUser.id, 'suspended');
    const inactive = await expectError(review(asOrgAdmin(suspendedUser.id, w.orgA.id), attempt, true));
    expect(inactive.message).toContain('member_required');
    const r = await review(w.a, attempt, false, 'Different person');
    expect(r.review_status).toBe('rejected');
    expect((await sessionRow(session)).status).toBe('failed');
    const audit = await runSqlRows(`select action from itap.audit_log where entity_id = '${attempt}'`);
    expect(audit.map((x) => x.action)).toEqual(['reject']);

    const plain = await insertAttempt(w.orgA.id, app.id, session, { attempt_no: 2, review_status: 'none' });
    const notPending = await expectError(review(w.a, plain, true));
    expect(notPending.message).toContain('auth_attempt_not_pending');
  });
});
