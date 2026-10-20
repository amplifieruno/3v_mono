import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { FACES } from './support/enrollment.js';
import {
  call,
  capture,
  extraApp,
  fixtureFace,
  openSession,
  restWorld,
  seedFace,
  sequence,
  triple,
  type Key,
  type RestWorld,
} from './support/authRest.js';
import { asAdmin } from './support/clients.js';
import { runSqlRows } from './support/sql.js';

/** Face authentication REST service end to end (real InsightFace, faces enrolled through enroll_face). */

let w: RestWorld;
let strict: { key: Key };

async function attemptsOf(session: string) {
  return runSqlRows(
    `select attempt_no, step, outcome, failure_reason, attack_outcome, evidence_file_id, matched_identity_id, review_status
     from itap.authentication_attempts where session_id = '${session}' order by attempt_no`,
  );
}

async function filesOfSession(session: string): Promise<number> {
  const data = await asAdmin().request<{ files: { id: string }[] }>(
    `query($m: jsonb!) { files(where: { metadata: { _contains: $m } }) { id } }`,
    { m: { session_id: session } },
  );
  return data.files.length;
}

beforeAll(async () => {
  await requireBackend();
  w = await restWorld();
  // Same population, threshold 0.95: the `low` sequence (~0.92) is a partial match, `high` (~0.97) a success.
  strict = await extraApp(w, { threshold: 0.95 });
}, 120_000);

describe('face auth REST: identification and verification', () => {
  it('should identify an enrolled person with exactly the permitted attributes and keep no evidence', async () => {
    const session = await openSession(w.key);
    const reply = await capture(w.key, session, await sequence('high'));
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(reply.body).toMatchObject({ outcome: 'success', authenticated: true, attack_outcome: 'passed', next_step: 'none' });
    const identity = reply.body.identity as { id: string; attributes: Record<string, unknown> };
    expect(identity.id).toBe(w.person);
    expect(Object.keys(identity.attributes).sort()).toEqual(['display_name', 'employee_id', 'photo']);
    expect(identity.attributes.display_name).toBe('Ada Access');
    expect(identity.attributes.employee_id).toBe('E-0303');
    expect((identity.attributes.photo as { url: string }).url).toMatch(/^https?:\/\//);
    expect(reply.body.confidence).toBeGreaterThan(0.6);
    expect(reply.body.failure).toBeUndefined();
    const [attempt] = await attemptsOf(session.session_id);
    expect(attempt).toMatchObject({ outcome: 'success', attack_outcome: 'passed', evidence_file_id: 'NULL' });
    await new Promise((r) => setTimeout(r, 500));
    expect(await filesOfSession(session.session_id)).toBe(0);
  });

  it('should verify a claimed identity sent in any letter case (canonical uuid binding)', async () => {
    const session = await openSession(w.key, { mode: 'verification', claimed_identity_id: w.person.toUpperCase() });
    const reply = await capture(w.key, session, await sequence('high'), { claimed_identity_id: w.person });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(reply.body).toMatchObject({ outcome: 'success', identity: { id: w.person } });
  });

  it('should refuse a claim in identification and a missing claim in verification', async () => {
    const bad = await call(w.key, 'POST', '/v1/auth/sessions', { mode: 'identification', claimed_identity_id: w.person, device_ref: 'k' });
    expect(bad.status).toBe(400);
    const session = await openSession(w.key, { mode: 'verification', claimed_identity_id: w.person });
    const missing = await capture(w.key, session, await sequence('high'));
    expect(missing.status).toBe(400);
    const other = await capture(w.key, session, await sequence('high'), { claimed_identity_id: w.other });
    expect(other.status).toBe(409);
    expect(other.body.error?.code).toBe('session_mismatch');
  });
});

describe('face auth REST: partial match flow', () => {
  it('should answer a partial match without identity or score, then succeed on recapture', async () => {
    const session = await openSession(strict.key);
    const first = await capture(strict.key, session, await sequence('low'));
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ outcome: 'partial_match', authenticated: false, next_step: 'recapture' });
    expect(first.body.identity).toBeUndefined();
    expect(first.body.confidence).toBeUndefined();
    expect(first.body.failure).toMatchObject({ code: 'partial_match', retryable: true });

    const wrongEndpoint = await capture(strict.key, session, await sequence('high'));
    expect(wrongEndpoint.status).toBe(409);
    const second = await capture(strict.key, session, await sequence('high'), {}, true);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body).toMatchObject({ outcome: 'success', identity: { id: w.person }, next_step: 'none' });
    const attempts = await attemptsOf(session.session_id);
    expect(attempts.map((a) => [a.step, a.outcome])).toEqual([['initial', 'partial_match'], ['recapture', 'success']]);
    expect(attempts[0].evidence_file_id).not.toBe('NULL');
    expect(attempts[1].evidence_file_id).toBe('NULL');
  });

  it('should accept a passed second factor after a partial match (identity of the partial match)', async () => {
    const session = await openSession(strict.key);
    expect((await capture(strict.key, session, await sequence('low'))).body.outcome).toBe('partial_match');
    const reply = await call(strict.key, 'POST', `/v1/auth/sessions/${session.session_id}/second-factor`, { result: 'passed', method: 'pin' });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(reply.body).toMatchObject({ outcome: 'success', identity: { id: w.person, attributes: { display_name: 'Ada Access' } } });
    const attempts = await attemptsOf(session.session_id);
    expect(attempts.map((a) => [a.step, a.outcome])).toEqual([['initial', 'partial_match'], ['second_factor', 'success']]);
    const status = await call(strict.key, 'GET', `/v1/auth/sessions/${session.session_id}`);
    expect(status.body).toMatchObject({ status: 'succeeded', authenticated: true, identity: { id: w.person } });
  });

  it('should record a failed second factor and refuse one without a partial match', async () => {
    const session = await openSession(strict.key);
    await capture(strict.key, session, await sequence('low'));
    const failed = await call(strict.key, 'POST', `/v1/auth/sessions/${session.session_id}/second-factor`, { result: 'failed', method: 'card' });
    expect(failed.body).toMatchObject({ outcome: 'failure', failure: { code: 'second_factor_failed' }, next_step: 'none' });
    expect(failed.body.identity).toBeUndefined();
    const fresh = await openSession(strict.key);
    const early = await call(strict.key, 'POST', `/v1/auth/sessions/${fresh.session_id}/second-factor`, { result: 'passed', method: 'pin' });
    expect(early.status).toBe(409);
    expect(early.body.error?.code).toBe('second_factor_not_allowed');
  });

  it('should refer a third partial match to manual review and report it on polling', async () => {
    const session = await openSession(strict.key);
    await capture(strict.key, session, await sequence('low'));
    const second = await capture(strict.key, session, await sequence('low'), {}, true);
    expect(second.body.next_step).toBe('second_factor');
    const third = await capture(strict.key, session, await sequence('low'), {}, true);
    expect(third.body).toMatchObject({ outcome: 'partial_match', next_step: 'review' });
    const status = await call(strict.key, 'GET', `/v1/auth/sessions/${session.session_id}`);
    expect(status.body).toMatchObject({ status: 'review', review_status: 'pending', authenticated: false, next_step: 'review' });
  });
});

describe('face auth REST: quality failures with guidance', () => {
  const p3 = () => seedFace('person-03', 1);
  const cases: [string, () => Promise<Buffer[]>][] = [
    ['no_face', async () => triple(fixtureFace(FACES.noFace))],
    ['multiple_faces', async () => triple(fixtureFace(FACES.group))],
    ['low_quality', async () => triple(await sharp(p3()).resize(48, 48).jpeg().toBuffer())],
    ['poor_lighting', async () => triple(await sharp(p3()).modulate({ brightness: 0.4 }).jpeg().toBuffer())],
    ['blur', async () => triple(await sharp(p3()).blur(2.5).jpeg().toBuffer())],
  ];
  for (const [reason, frames] of cases) {
    it(`should fail with ${reason}, guidance and a recapture while recaptures remain`, async () => {
      const session = await openSession(w.key);
      const reply = await capture(w.key, session, await frames());
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      expect(reply.body).toMatchObject({ outcome: 'failure', next_step: 'recapture', failure: { code: reason, retryable: true } });
      expect(String((reply.body.failure as { guidance: string }).guidance).length).toBeGreaterThan(10);
      const [attempt] = await attemptsOf(session.session_id);
      expect(attempt).toMatchObject({ failure_reason: reason, attack_outcome: 'not_checked' });
      expect(attempt.evidence_file_id).not.toBe('NULL');
    });
  }
});
