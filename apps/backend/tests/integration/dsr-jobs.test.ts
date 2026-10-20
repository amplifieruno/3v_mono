import { describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { asOrgAdmin } from './support/clients.js';
import { awaitingDsr, DSR_FIELDS, dsrSteps, fileDsr, jobCall, readDsr, settledDsr, type Dsr } from './support/dsr.js';
import { axis, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { count } from './support/retention.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** DSR job (slice 10 task 3): lease / retry, rejection, rectification, restriction (Review Focus 3), SLA, permissions. */

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const b = asOrgAdmin(other.id, orgB.id);
  const profile = await createProfile(a);
  return { org: orgA.id, user, a, b, profile };
}

const complete = (client: ReturnType<typeof asOrgAdmin>, id: string, outcome: string) =>
  callFn<Dsr>(client, 'complete_dsr', { p_request: id, p_outcome: outcome }, DSR_FIELDS);
const reject = (client: ReturnType<typeof asOrgAdmin>, id: string, reason: string) =>
  callFn<Dsr>(client, 'reject_dsr', { p_request: id, p_reason: reason }, DSR_FIELDS);
const retry = (client: ReturnType<typeof asOrgAdmin>, id: string) => callFn<Dsr>(client, 'retry_dsr', { p_request: id }, DSR_FIELDS);

describe('DSR permissions', () => {
  it('should let org_admin file requests with requested changes but never write job columns or call job functions', async () => {
    const w = await world();
    const dsr = await fileDsr(w.a, w.profile, 'rectification', { details: { email: 'new@example.test' } });
    expect(dsr).toMatchObject({ status: 'received', partial: false, outcome: null, details: { email: 'new@example.test' } });
    for (const column of ['partial', 'outcome', 'overdue_notified_at']) {
      await expectDenied(updateByPk(w.a, 'data_subject_requests', dsr.id, { [column]: column === 'partial' ? true : 'x' }), column);
      await expectDenied(insertOne(w.a, 'data_subject_requests', { profile_id: w.profile, request_type: 'access', [column]: column === 'partial' ? true : 'x' }), column);
    }
    await expectDenied(updateByPk(w.a, 'data_subject_requests', dsr.id, { details: {} }), 'details');
    // Job functions are admin-only (not in the org_admin schema).
    await expectDenied(w.a.request(`mutation { claim_dsr(args: {p_request: "${dsr.id}"}) { id } }`), 'claim_dsr');
    await expectDenied(w.a.request(`mutation { dsr_erase(args: {p_request: "${dsr.id}", p_attempt: 1}) { id } }`), 'dsr_erase');
    // details must be an object.
    await expectError(insertOne(w.a, 'data_subject_requests', { profile_id: w.profile, request_type: 'rectification', details: [1] }));
  });
});

describe('DSR rectification and rejection', () => {
  it('should wait for the manual change and close it with complete_dsr (audited), once', async () => {
    const w = await world();
    const dsr = await fileDsr(w.a, w.profile, 'rectification', { details: { last_name: 'Corrected' } });
    const waiting = await awaitingDsr(dsr.id);
    expect(waiting.attempts).toBe(1);
    expect((await dsrSteps(dsr.id)).map((s) => s.step)).toEqual(['claimed', 'awaiting_rectification']);
    // org_admin applies the change through the normal (audited) update, then closes the request.
    await updateByPk(w.a, 'profiles', w.profile, { last_name: 'Corrected' });
    expect((await expectError(complete(w.a, dsr.id, '  '))).message).toContain('dsr_outcome_required');
    expect((await expectError(complete(w.b, dsr.id, 'x'))).message).toContain('dsr_not_found');
    const done = await complete(w.a, dsr.id, 'Last name corrected');
    expect(done).toMatchObject({ status: 'completed', outcome: 'Last name corrected' });
    expect(done.completed_at).not.toBeNull();
    expect((await expectError(complete(w.a, dsr.id, 'again'))).message).toContain('dsr_closed');
    const [audit] = await runSqlRows(
      `select user_id, entity, entity_id, reason from itap.audit_log where action = 'rectify' and organization_id = '${w.org}'`,
    );
    expect(audit).toMatchObject({ user_id: w.user.id, entity: 'profiles', entity_id: w.profile, reason: 'Last name corrected' });
    expect((await dsrSteps(dsr.id)).map((s) => s.step)).toEqual(['claimed', 'awaiting_rectification', 'completed']);
    // complete_dsr only closes rectifications.
    const restriction = await settledDsr((await fileDsr(w.a, w.profile, 'restriction')).id);
    expect((await expectError(complete(w.a, restriction.id, 'x'))).message).toContain('dsr_complete_type');
  });

  it('should reject an open request with a reason (audited) and refuse closed ones', async () => {
    const w = await world();
    const dsr = await fileDsr(w.a, w.profile, 'rectification');
    await awaitingDsr(dsr.id);
    expect((await expectError(reject(w.a, dsr.id, ' '))).message).toContain('dsr_rejection_reason_required');
    expect((await expectError(reject(w.b, dsr.id, 'x'))).message).toContain('dsr_not_found');
    const rejected = await reject(w.a, dsr.id, 'Identity could not be verified');
    expect(rejected).toMatchObject({ status: 'rejected', rejection_reason: 'Identity could not be verified', lease_expires_at: null });
    expect((await expectError(reject(w.a, dsr.id, 'again'))).message).toContain('dsr_closed');
    const [audit] = await runSqlRows(
      `select user_id, entity, entity_id, reason from itap.audit_log where action = 'reject' and entity_id = '${dsr.id}'`,
    );
    expect(audit).toMatchObject({ user_id: w.user.id, entity: 'data_subject_requests', reason: 'Identity could not be verified' });
    expect((await dsrSteps(dsr.id)).at(-1)?.step).toBe('rejected');
  });
});

describe('DSR lease and retry', () => {
  it('should fence attempts, back off failures, give up after max attempts and requeue on retry_dsr', async () => {
    const w = await world();
    const dsr = await fileDsr(w.a, w.profile, 'rectification');
    await awaitingDsr(dsr.id);
    // Not claimable while waiting (no lease); claimable once a lease expired.
    expect(await jobCall('claim_dsr', `'${dsr.id}'`)).toEqual([]);
    await runSql(`update itap.data_subject_requests set lease_expires_at = now() - interval '1 second' where id = '${dsr.id}'`);
    const [claimed] = await jobCall('claim_dsr', `'${dsr.id}'`);
    expect(Number(claimed.attempts)).toBe(2);
    expect(await jobCall('claim_dsr', `'${dsr.id}'`)).toEqual([]);
    // A stale attempt cannot fail (or finish) the request; the current one records the error and backs off.
    expect(await jobCall('fail_dsr', `'${dsr.id}', 1, 'stale'`)).toEqual([]);
    expect(await jobCall('dsr_restrict', `'${dsr.id}', 1`)).toEqual([]);
    const [failed] = await jobCall('fail_dsr', `'${dsr.id}', 2, 'storage down'`);
    expect(failed.last_error).toBe('storage down');
    expect(Date.parse(String(failed.lease_expires_at))).toBeGreaterThan(Date.now() + 30_000);
    expect(await jobCall('claim_dsr', `'${dsr.id}'`)).toEqual([]);
    // Max attempts (5 since the last retry): the claim gives up.
    await runSql(`update itap.data_subject_requests set attempts = 5, lease_expires_at = now() - interval '1 second' where id = '${dsr.id}'`);
    expect(await jobCall('claim_dsr', `'${dsr.id}'`)).toEqual([]);
    expect(await readDsr(dsr.id)).toMatchObject({ status: 'in_progress', last_error: 'max_attempts', lease_expires_at: null });
    const steps = (await dsrSteps(dsr.id)).map((s) => s.step);
    expect(steps).toEqual(expect.arrayContaining(['failed', 'gave_up']));
    // retry_dsr (org_admin) requeues: the trigger runs the job again.
    expect((await expectError(retry(w.b, dsr.id))).message).toContain('dsr_not_found');
    const requeued = await retry(w.a, dsr.id);
    expect(requeued).toMatchObject({ attempts_at_retry: 5, last_error: null });
    const again = await settledDsr(dsr.id, (d) => d.attempts === 6 && d.lease_expires_at === null);
    expect(again.status).toBe('in_progress');
    expect((await expectError(retry(w.a, dsr.id))).message).toContain('dsr_not_failed');
  });

  it('should reject a request whose subject profile is gone', async () => {
    const w = await world();
    const dsr = await fileDsr(w.a, w.profile, 'rectification');
    await awaitingDsr(dsr.id);
    await runSql(`update itap.data_subject_requests set profile_id = null, lease_expires_at = now() - interval '1 second' where id = '${dsr.id}'`);
    expect(await jobCall('claim_dsr', `'${dsr.id}'`)).toEqual([]);
    expect(await readDsr(dsr.id)).toMatchObject({ status: 'rejected', rejection_reason: 'subject_not_found' });
  });
});

describe('DSR restriction (Review Focus 3)', () => {
  it('should restrict the person through the job: no matching, search or processing, data kept', async () => {
    const w = await world();
    const identity = await faceIdentity(w.org, [axis(30)], { profile: w.profile });
    const match = async () =>
      (
        await w.a.request<{ match_face: { identity_id: string }[] }>(
          `query($e: String!) { match_face(args: { p_embedding: $e, p_limit: 5 }) { identity_id } }`,
          { e: vectorLiteral(axis(30)) },
        )
      ).match_face.map((m) => m.identity_id);
    expect(await match()).toEqual([identity]);
    const dsr = await fileDsr(w.a, w.profile, 'restriction');
    const done = await settledDsr(dsr.id);
    expect(done).toMatchObject({ status: 'completed', partial: false });
    const [p] = await runSqlRows(`select processing_restricted, restriction_reason from itap.profiles where id = '${w.profile}'`);
    expect(p).toEqual({ processing_restricted: 't', restriction_reason: `dsr:${dsr.code}` });
    expect(await match()).toEqual([]);
    const searched = await runSqlRows(`select identity_id from itap.search_identities('${w.org}', '${vectorLiteral(axis(30))}', 0.5, 10, '{}'::jsonb)`);
    expect(searched).toEqual([]);
    expect(await count(`itap.identity_embeddings where identity_id = '${identity}'`)).toBe(1);
    expect((await dsrSteps(dsr.id)).map((s) => s.step)).toEqual(['claimed', 'restricted', 'completed']);
    const [audit] = await runSqlRows(`select reason from itap.audit_log where action = 'restrict' and entity_id = '${w.profile}'`);
    expect(audit.reason).toBe(`dsr:${dsr.code}`);
  });
});

describe('DSR SLA', () => {
  it('should emit dsr_overdue once per overdue open request', async () => {
    const w = await world();
    const late = await fileDsr(w.a, w.profile, 'rectification', { received_at: new Date(Date.now() - 31 * 86400_000).toISOString() });
    const closedLate = await fileDsr(w.a, w.profile, 'rectification', { received_at: new Date(Date.now() - 40 * 86400_000).toISOString() });
    const fresh = await fileDsr(w.a, w.profile, 'rectification');
    await Promise.all([late, closedLate, fresh].map((d) => awaitingDsr(d.id)));
    await reject(w.a, closedLate.id, 'Withdrawn by the requester');
    await runSql(`select itap.dsr_overdue_events(now())`);
    await runSql(`select itap.dsr_overdue_events(now())`);
    const events = await runSqlRows(
      `select event_type, severity, payload ->> 'code' as code, profile_id from itap.events
       where organization_id = '${w.org}' and event_type = 'dsr_overdue'`,
    );
    expect(events).toEqual([{ event_type: 'dsr_overdue', severity: 'medium', code: late.code, profile_id: 'NULL' }]);
    expect((await readDsr(late.id)).overdue_notified_at).not.toBeNull();
    expect((await readDsr(fresh.id)).overdue_notified_at).toBeNull();
    expect((await dsrSteps(late.id)).filter((s) => s.step === 'overdue')).toHaveLength(1);
  });
});
