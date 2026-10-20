import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import {
  binding,
  call,
  capture,
  extraApp,
  fixtureFace,
  openSession,
  restWorld,
  seedFace,
  sequence,
  stable,
  triple,
  type RestWorld,
} from './support/authRest.js';
import { FACES } from './support/enrollment.js';
import { runSqlRows } from './support/sql.js';

/**
 * Review Focus 3 (replayed / foreign-bound sequences are attacks, recorded distinctly from no-match) and Review
 * Focus 2 at the boundary (verification answers are identical whatever the reason of the non-match).
 */

let w: RestWorld;

async function attempt(session: string): Promise<Record<string, unknown> & { details: Record<string, unknown> }> {
  const [row] = await runSqlRows(
    `select outcome, failure_reason, attack_outcome, attack_details::text as details, matched_identity_id, confidence
     from itap.authentication_attempts where session_id = '${session}' order by attempt_no desc limit 1`,
  );
  const r: Record<string, string | null> = row ?? {};
  return { ...r, details: JSON.parse(r.details ?? '{}') as Record<string, unknown> };
}

beforeAll(async () => {
  await requireBackend();
  w = await restWorld();
}, 120_000);

describe('face auth REST: replay and session binding (Review Focus 3)', () => {
  it('should refuse a replayed sequence (same digest, valid new binding) as injection, distinct from no-match', async () => {
    const frames = await sequence('high');
    const first = await openSession(w.key);
    expect((await capture(w.key, first, frames)).body.outcome).toBe('success');

    const second = await openSession(w.key);
    const replay = await capture(w.key, second, frames);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ outcome: 'failure', attack_outcome: 'injection', failure: { code: 'attack_detected' } });
    expect(replay.body.identity).toBeUndefined();
    const row = await attempt(second.session_id);
    expect(row).toMatchObject({ outcome: 'failure', failure_reason: 'attack_detected', attack_outcome: 'injection' });
    expect(row.details.replay).toBe(true);
  });

  it('should refuse a sequence bound to another session as injection', async () => {
    const other = await openSession(w.key);
    const target = await openSession(w.key);
    const frames = await sequence('high');
    const reply = await capture(w.key, target, frames, { binding: binding(w.key.secret, other.nonce, frames, other.device_ref) });
    expect(reply.body).toMatchObject({ outcome: 'failure', attack_outcome: 'injection', failure: { code: 'attack_detected' } });
    const row = await attempt(target.session_id);
    expect(row).toMatchObject({ failure_reason: 'attack_detected', attack_outcome: 'injection' });
    expect(row.details).toMatchObject({ reason: 'binding_mismatch', binding: 'mismatch' });
  });

  it('should refuse a sequence bound with another application\'s key or another device as injection', async () => {
    const foreign = await extraApp(w, { threshold: 0.6 });
    const session = await openSession(w.key);
    const frames = await sequence('high');
    const byOtherApp = await capture(w.key, session, frames, { binding: binding(foreign.key.secret, session.nonce, frames, session.device_ref) });
    expect(byOtherApp.body).toMatchObject({ outcome: 'failure', attack_outcome: 'injection' });

    const session2 = await openSession(w.key);
    const frames2 = await sequence('high');
    const byOtherDevice = await capture(w.key, session2, frames2, { binding: binding(w.key.secret, session2.nonce, frames2, 'kiosk-9') });
    expect(byOtherDevice.body).toMatchObject({ outcome: 'failure', attack_outcome: 'injection' });
  });

  it('should flag a sequence without inter-frame change as printed_photo and duplicated frames as injection', async () => {
    const base = seedFace('person-03', 1);
    // The same picture re-encoded (95 / 92 / 90): hamming 0, similarity ~0.994.
    const still = await Promise.all([95, 92, 90].map((q) => sharp(base).jpeg({ quality: q }).toBuffer()));
    const s1 = await openSession(w.key);
    const r1 = await capture(w.key, s1, still);
    expect(r1.body).toMatchObject({ outcome: 'failure', attack_outcome: 'printed_photo', failure: { code: 'attack_detected' } });
    expect((await attempt(s1.session_id)).details).toMatchObject({ reason: 'no_inter_frame_change' });

    const frame = await sharp(base).jpeg({ quality: 77 }).toBuffer();
    const s2 = await openSession(w.key);
    const r2 = await capture(w.key, s2, [frame, frame, await sharp(base).jpeg({ quality: 70 }).toBuffer()]);
    expect(r2.body).toMatchObject({ outcome: 'failure', attack_outcome: 'injection' });
    expect((await attempt(s2.session_id)).details).toMatchObject({ reason: 'duplicate_frames' });
  });
});

describe('face auth REST: no oracle in verification (Review Focus 2 at the boundary)', () => {
  it('should answer unknown, malformed, out-of-population and below-threshold claims identically', async () => {
    const claims = [randomUUID(), 'not-a-uuid', w.outside, w.other];
    const bodies: Record<string, unknown>[] = [];
    const sessions: string[] = [];
    for (const claim of claims) {
      const session = await openSession(w.key, { mode: 'verification', claimed_identity_id: claim });
      const reply = await capture(w.key, session, await sequence('high'), { claimed_identity_id: claim });
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      bodies.push(stable(reply.body));
      sessions.push(session.session_id);
    }
    expect(bodies[0]).toMatchObject({ outcome: 'failure', failure: { code: 'below_threshold' }, attack_outcome: 'passed' });
    for (const body of bodies.slice(1)) expect(body).toEqual(bodies[0]);
    // Recorded with the real reason; a no-match keeps attack_outcome passed (distinct from an attack).
    const rows = await Promise.all(sessions.map(attempt));
    expect(rows.map((r) => r.failure_reason)).toEqual(['not_in_population', 'not_in_population', 'not_in_population', 'below_threshold']);
    for (const row of rows) expect(row.attack_outcome).toBe('passed');
  });

  it('should not return a candidate or score for an identification failure', async () => {
    const session = await openSession(w.key);
    // person-b is enrolled but outside the app's population: the best candidate is far below the threshold.
    const reply = await capture(w.key, session, await triple(fixtureFace(FACES.personB)));
    expect(reply.body).toMatchObject({ outcome: 'failure', failure: { code: 'below_threshold' } });
    expect(Object.keys(reply.body).sort()).toEqual(
      ['attack_outcome', 'authenticated', 'failure', 'next_step', 'outcome', 'request_id', 'session_id', 'timestamp'],
    );
  });

  it('should treat an unknown session id like a missing session', async () => {
    const reply = await call(w.key, 'GET', `/v1/auth/sessions/${randomUUID()}`);
    expect(reply.status).toBe(404);
    expect(reply.body.error?.code).toBe('session_not_found');
  });
});
