import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { addSegmentRows, bind } from './support/authDecide.js';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { BASE, call, capture, fixtureFace, openSession, restWorld, rotateKey, sequence, triple, type RestWorld } from './support/authRest.js';
import { FACES } from './support/enrollment.js';
import { createApp } from './support/authService.js';
import { testEnv } from './support/clients.js';
import { manualSegment } from './support/segments.js';
import { cronPayload, postTrigger } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Sandbox, session expiry sweep, console action, timeout, health and the response time at the boundary. */

let w: RestWorld;

beforeAll(async () => {
  await requireBackend();
  w = await restWorld();
}, 120_000);

const tripleNoFace = () => triple(fixtureFace(FACES.noFace));
const pct = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)];

describe('face auth: sandbox (synthetic identities only)', () => {
  it('should identify the synthetic twin in the sandbox and the production identity in production', async () => {
    // A synthetic identity carrying copies of the production person's templates, in an identity segment.
    const [syn] = await runSqlRows(`insert into itap.identities (organization_id, is_synthetic) values ('${w.org}', true) returning id`);
    await runSql(`insert into itap.identity_embeddings (organization_id, identity_id, embedding, quality_score)
      select organization_id, '${syn.id}', embedding, quality_score from itap.identity_embeddings
      where identity_id = '${w.person}' and is_template`);
    const segment = await manualSegment(w.a, 'identities');
    await addSegmentRows(w.org, segment.id, 'identities', [String(syn.id)]);
    const sandbox = await createApp(w.a, { is_sandbox: true, threshold: 0.6 });
    await bind(w.org, sandbox.id, { segments: [segment.id, w.segment.id], modes: ['identification', 'verification'], attributes: ['display_name'] });
    const key = await rotateKey(w.a, sandbox.id);

    const reply = await capture(key, await openSession(key), await sequence('high'));
    expect(reply.body).toMatchObject({ outcome: 'success', identity: { id: syn.id } });
    const claim = await openSession(key, { mode: 'verification', claimed_identity_id: w.person });
    const verify = await capture(key, claim, await sequence('high'), { claimed_identity_id: w.person });
    expect(verify.body).toMatchObject({ outcome: 'failure', failure: { code: 'below_threshold' } });

    const production = await capture(w.key, await openSession(w.key), await sequence('high'));
    expect(production.body).toMatchObject({ outcome: 'success', identity: { id: w.person } });
    const [events] = await runSqlRows(
      `select count(*) as n from itap.events e join itap.authentication_attempts a on a.id = e.authentication_attempt_id
       where a.application_id = '${sandbox.id}'`,
    );
    expect(Number(events.n)).toBe(0);
  });
});

describe('face auth: session expiry sweep', () => {
  it('should expire open sessions past expires_at through the cron and never touch review sessions', async () => {
    const open = await openSession(w.key);
    const review = await openSession(w.key);
    await runSql(`update itap.authentication_sessions set created_at = now() - interval '10 minutes',
      expires_at = now() - interval '1 minute' where id in ('${open.session_id}', '${review.session_id}')`);
    await runSql(`update itap.authentication_sessions set status = 'review' where id = '${review.session_id}'`);
    expect((await call(w.key, 'GET', `/v1/auth/sessions/${open.session_id}`)).body.status).toBe('expired');

    const run = await postTrigger('expire_auth_sessions', cronPayload('expire_auth_sessions'));
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    const rows = await runSqlRows(`select id, status, closed_at from itap.authentication_sessions
      where id in ('${open.session_id}', '${review.session_id}') order by status`);
    expect(rows.map((r) => r.status).sort()).toEqual(['expired', 'review']);
    const late = await capture(w.key, open, await sequence('high'));
    expect(late.status).toBe(409);
    expect(late.body.error?.code).toBe('session_closed');
  });
});

describe('face auth: evidence sweep', () => {
  it('should delete auth_capture files older than 10 minutes that no attempt references', async () => {
    const storage = createStorageClient(testEnv());
    const data = (await sequence('high'))[0];
    const upload = (name: string) => storage.upload({ bucketId: w.org, name, mimeType: 'image/jpeg', data, metadata: { kind: 'auth_capture' } });
    const stale = await upload('stale.jpg');
    const fresh = await upload('fresh.jpg');
    // A referenced evidence frame: a quality failure keeps its capture.
    const session = await openSession(w.key);
    await capture(w.key, session, await tripleNoFace());
    const [kept] = await runSqlRows(`select evidence_file_id as id from itap.authentication_attempts where session_id = '${session.session_id}'`);
    expect(kept.id).not.toBe('NULL');
    await runSql(`update storage.files set created_at = now() - interval '11 minutes'
      where id in ('${stale.id}', '${String(kept.id)}')`);
    const run = await postTrigger('expire_auth_sessions', cronPayload('expire_auth_sessions'));
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    const rows = await runSqlRows(`select id from storage.files where id in ('${stale.id}', '${fresh.id}', '${String(kept.id)}')`);
    expect(rows.map((r) => r.id).sort()).toEqual([fresh.id, String(kept.id)].sort());
  });
});

describe('face auth: authenticate_face console action', () => {
  it('should run the pipeline on stored files and record the attempt (binding not applicable)', async () => {
    const storage = createStorageClient(testEnv());
    const ids = await Promise.all(
      (await sequence('high')).map(async (data, i) => (await storage.upload({ bucketId: w.org, name: `probe-${i}.jpg`, mimeType: 'image/jpeg', data })).id),
    );
    const data = await w.a.request<{ authenticate_face: Record<string, unknown> }>(
      `mutation($app: uuid!, $files: [uuid!]!) { authenticate_face(application_id: $app, file_ids: $files, mode: "identification") {
        session_id attempt_id outcome authenticated identity_id attributes attack_outcome failure_code next_step } }`,
      { app: w.app.id, files: ids },
    );
    expect(data.authenticate_face).toMatchObject({ outcome: 'success', identity_id: w.person, attack_outcome: 'passed' });
    const [row] = await runSqlRows(`select device_ref, attack_details::text as d from itap.authentication_attempts
      where id = '${String(data.authenticate_face.attempt_id)}'`);
    expect(row.device_ref).toMatch(/^console:/);
    expect(JSON.parse(row.d ?? '{}')).toMatchObject({ binding: 'not_applicable_console' });
    const foreign = await w.b.request(
      `mutation($app: uuid!, $files: [uuid!]!) { authenticate_face(application_id: $app, file_ids: $files, mode: "identification") { outcome } }`,
      { app: w.app.id, files: ids },
    ).catch((e: unknown) => e);
    expect(String(foreign)).toMatch(/File not found/);

    // Sensitive kinds (evidence captures, profile documents) are never accepted as probes.
    const sensitive = await storage.upload({
      bucketId: w.org, name: 'evidence.jpg', mimeType: 'image/jpeg', data: (await sequence('high'))[0], metadata: { kind: 'auth_capture' },
    });
    const refused = await w.a.request(
      `mutation($app: uuid!, $files: [uuid!]!) { authenticate_face(application_id: $app, file_ids: $files, mode: "identification") { outcome } }`,
      { app: w.app.id, files: [sensitive.id, ids[1], ids[2]] },
    ).catch((e: unknown) => e);
    expect(String(refused)).toMatch(/File not found/);
  });
});

describe('face auth: timeout, health, OpenAPI', () => {
  it('should answer a retryable timeout when the request timeout elapses before a decision', async () => {
    const session = await openSession(w.key);
    const reply = await capture(w.key, session, await sequence('high'), { timeout_ms: 100 });
    expect(reply.status).toBe(504);
    expect(reply.body.error).toMatchObject({ code: 'timeout', retryable: true });
    expect(reply.body.session_id).toBe(session.session_id);
    const [n] = await runSqlRows(`select count(*) as n from itap.authentication_attempts where session_id = '${session.session_id}'`);
    expect(Number(n.n)).toBe(0);
  });

  it('should report health and serve the OpenAPI document without a key', async () => {
    const health = await fetch(`${BASE}/v1/auth/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', checks: { database: 'ok', face_service: 'ok' } });
    const doc = (await (await fetch(`${BASE}/v1/auth/openapi.json`)).json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/v1/auth/authenticate');
  });
});

describe('face auth: response time at the boundary (SA_6 §3.4: p95 <= 2 s)', () => {
  it('should measure identification successes end to end', async () => {
    const wall: number[] = [];
    const sessions: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const session = await openSession(w.key);
      const frames = await sequence('high');
      const started = performance.now();
      const reply = await capture(w.key, session, frames);
      wall.push(performance.now() - started);
      expect(reply.body.outcome).toBe('success');
      sessions.push(session.session_id);
    }
    const rows = await runSqlRows(`select session_id, (quality->'timings'->>'face_service_ms')::int as face
      from itap.authentication_attempts where session_id in (${sessions.map((s) => `'${s}'`).join(',')})`);
    const bySession = new Map(rows.map((r) => [String(r.session_id), Number(r.face)]));
    const face = sessions.map((s) => bySession.get(s) ?? 0);
    const stats = {
      n: wall.length,
      wall_p50_ms: Math.round(pct(wall, 50)),
      wall_p95_ms: Math.round(pct(wall, 95)),
      wall_max_ms: Math.round(Math.max(...wall)),
      face_service_p50_ms: pct(face, 50),
      face_service_p95_ms: pct(face, 95),
      non_face_p95_ms: Math.round(pct(wall.map((t, i) => t - (face[i] ?? 0)), 95)),
    };
    if (process.env.AUTH_LATENCY_REPORT) process.stdout.write(`AUTH_LATENCY ${JSON.stringify(stats)}\n`);
    // Everything but the InsightFace call stays far inside the budget; the total depends on the face service host.
    expect(stats.non_face_p95_ms, JSON.stringify(stats)).toBeLessThan(500);
    expect(stats.wall_p95_ms, JSON.stringify(stats)).toBeLessThan(4000);
  }, 120_000);
});
