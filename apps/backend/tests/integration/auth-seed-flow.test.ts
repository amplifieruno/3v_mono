import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addSegmentRows, bind, claimedRefHash, faceIdentity, similarTo } from './support/authDecide.js';
import { authWorld, backendActor, createApp } from './support/authService.js';
import { axis, vectorLiteral } from './support/faces.js';
import { expectDenied } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';

/**
 * itap.seed_auth_flow (slice 9 task 4): the seed's back-dated authentication history through the real functions —
 * auth_open_session, auth_decide (p_at), auth_second_factor and review_authentication_attempt — at simulated instants.
 */

type Attempt = { id: string; outcome: string; step: string; attempted_at: string; review_status: string; failure_reason: string | null };
const FIELDS = 'id outcome step attempted_at review_status failure_reason';

const iso = (ms: number): string => new Date(ms).toISOString();
const MIN = 60_000;

async function flow(w: PastWorld, body: Record<string, unknown>): Promise<Attempt[]> {
  const data = await backendActor(w.user.id, w.org).request<{ seed_auth_flow: Attempt[] }>(
    `mutation($f: jsonb!) { seed_auth_flow(args: { p_flow: $f }, order_by: { attempted_at: asc }) { ${FIELDS} } }`,
    { f: body },
  );
  return data.seed_auth_flow;
}

const step = (at: number, embedding: number[], extra: Record<string, unknown> = {}) => ({
  kind: 'decide',
  at: iso(at),
  embedding: vectorLiteral(embedding),
  quality: { model_version: 'test_model', pipeline_ms: 210 },
  attack: { outcome: 'passed', sequence_digest: randomUUID().replace(/-/g, '') },
  ...extra,
});

async function sessionRow(id: string): Promise<Record<string, string | null>> {
  const [row] = await runSqlRows(
    `select status, created_at, expires_at, closed_at, step_count, device_ref from itap.authentication_sessions where id = '${id}'`,
  );
  return row;
}

/** decideWorld's org and app, with the person's segment membership opened 40 days ago (the flows run in the past). */
async function pastWorld() {
  const w = await authWorld();
  const org = w.orgA.id;
  const app = await createApp(w.a, { threshold: 0.6, threshold_min: 0.5, threshold_max: 0.9 });
  await bind(org, app.id, { segments: [w.segment.id], modes: ['identification', 'verification'] });
  const person = await faceIdentity(org, [axis(0)], { profile: w.profile });
  await addSegmentRows(org, w.segment.id, 'profiles', [w.profile], "now() - interval '40 days'");
  return { ...w, org, app, person };
}
type PastWorld = Awaited<ReturnType<typeof pastWorld>>;

const same = (a: string | null | undefined, b: number): void => expect(new Date(String(a)).getTime()).toBe(b);

describe('seed_auth_flow', () => {
  it('should open a back-dated session and record partial then success at the simulated instants', async () => {
    const w = await pastWorld();
    const at = Date.now() - 10 * 24 * 60 * MIN;
    const session = randomUUID();
    const attempts = await flow(w, {
      kind: 'session',
      application_id: w.app.id,
      session_id: session,
      mode: 'identification',
      device_ref: 'kiosk-lobby-1',
      ip: '10.20.0.15',
      user_agent: 'itap-kiosk/2.4',
      at: iso(at),
      steps: [step(at + 5_000, similarTo(0, 1, 0.56)), step(at + 20_000, similarTo(0, 1, 0.9))],
    });
    expect(attempts.map((a) => [a.step, a.outcome])).toEqual([['initial', 'partial_match'], ['recapture', 'success']]);
    same(attempts[0].attempted_at, at + 5_000);
    same(attempts[1].attempted_at, at + 20_000);
    const s = await sessionRow(session);
    expect(s.status).toBe('succeeded');
    same(s.created_at, at);
    same(s.expires_at, at + 5 * MIN);
    same(s.closed_at, at + 20_000);
    const [event] = await runSqlRows(
      `select event_type, occurred_at from itap.events where authentication_attempt_id = '${attempts[1].id}'`,
    );
    expect(event.event_type).toBe('auth_success');
    same(event.occurred_at, at + 20_000);
  });

  it('should record a second factor after a verification partial match at its instant', async () => {
    const w = await pastWorld();
    const at = Date.now() - 3 * 24 * 60 * MIN;
    const session = randomUUID();
    const attempts = await flow(w, {
      kind: 'session',
      application_id: w.app.id,
      session_id: session,
      mode: 'verification',
      claimed_identity_id: w.person,
      claimed_ref_hash: claimedRefHash(w.person),
      device_ref: 'hr-portal-web',
      at: iso(at),
      steps: [step(at + 4_000, similarTo(0, 1, 0.56)), { kind: 'second_factor', at: iso(at + 50_000), passed: false, method: 'otp' }],
    });
    expect(attempts.map((a) => [a.step, a.outcome, a.failure_reason])).toEqual([
      ['initial', 'partial_match', null],
      ['second_factor', 'failure', 'second_factor_failed'],
    ]);
    same(attempts[1].attempted_at, at + 50_000);
    const s = await sessionRow(session);
    expect(s.status).toBe('failed');
    same(s.closed_at, at + 50_000);
  });

  it('should queue a review after the third partial match and let a member decide it at the review instant', async () => {
    const w = await pastWorld();
    const at = Date.now() - 2 * 24 * 60 * MIN;
    const session = randomUUID();
    const partial = similarTo(0, 1, 0.56);
    const attempts = await flow(w, {
      kind: 'session',
      application_id: w.app.id,
      session_id: session,
      mode: 'identification',
      device_ref: 'kiosk-lobby-2',
      at: iso(at),
      steps: [step(at + 3_000, partial), step(at + 15_000, partial), step(at + 30_000, partial)],
    });
    expect(attempts.map((a) => a.review_status)).toEqual(['none', 'none', 'pending']);
    expect((await sessionRow(session)).status).toBe('review');

    const reviewAt = at + 45 * MIN;
    const [reviewed] = await flow(w, { kind: 'review', session_id: session, at: iso(reviewAt), approve: true, note: 'Badge checked at the desk' });
    expect(reviewed.review_status).toBe('approved');
    const [row] = await runSqlRows(
      `select a.reviewed_at, a.reviewed_by, s.status, s.closed_at,
              (select occurred_at from itap.audit_log l where l.entity_id = a.id and l.action = 'approve') as audited_at,
              (select occurred_at from itap.events e where e.authentication_attempt_id = a.id) as event_at
         from itap.authentication_attempts a join itap.authentication_sessions s on s.id = a.session_id
        where a.id = '${reviewed.id}'`,
    );
    same(row.reviewed_at, reviewAt);
    expect(row.reviewed_by).toBe(w.user.id);
    expect(row.status).toBe('succeeded');
    same(row.closed_at, reviewAt);
    same(row.audited_at, reviewAt);
    same(row.event_at, reviewAt);
  });

  it('should reset the simulated clock: a live session opened in the same request is stamped now', async () => {
    const w = await pastWorld();
    const at = Date.now() - 5 * 24 * 60 * MIN;
    const live = randomUUID();
    const before = Date.now();
    const data = await backendActor(w.user.id, w.org).request<{ live: { created_at: string }[] }>(
      `mutation($f: jsonb!, $org: uuid!, $app: uuid!, $s: uuid!) {
        past: seed_auth_flow(args: { p_flow: $f }) { id }
        live: auth_open_session(args: { p_org: $org, p_app: $app, p_key: null, p_session: $s, p_mode: "identification",
          p_claimed_identity: null, p_claimed_ref_hash: null, p_access_point: null, p_device_ref: "kiosk", p_nonce_hash: "${'a'.repeat(64)}",
          p_ip: null, p_user_agent: null }) { created_at }
      }`,
      {
        f: { kind: 'session', application_id: w.app.id, session_id: randomUUID(), mode: 'identification', device_ref: 'k', at: iso(at),
             steps: [step(at + 1_000, axis(0))] },
        org: w.org,
        app: w.app.id,
        s: live,
      },
    );
    expect(new Date(data.live[0].created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);
  });

  it('should not be exposed to organization admins', async () => {
    const w = await pastWorld();
    await expectDenied(
      w.a.request(`mutation($f: jsonb!) { seed_auth_flow(args: { p_flow: $f }) { id } }`, { f: { kind: 'review' } }),
      'seed_auth_flow',
    );
  });
});
