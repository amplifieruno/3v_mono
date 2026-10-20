import { describe, expect, it } from 'vitest';
import {
  addSegmentRows,
  bind,
  countRows,
  decide,
  decideWorld,
  faceIdentity,
  publicPart,
  similarTo,
} from './support/authDecide.js';
import { createApp } from './support/authService.js';
import { axis } from './support/faces.js';
import { manualSegment } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

const attemptRow = async (id: string | null): Promise<Record<string, string | null>> =>
  (await runSqlRows(`select * from itap.authentication_attempts where id = '${id}'`))[0];
const sessionRow = async (id: string): Promise<Record<string, string | null>> =>
  (await runSqlRows(`select status, step, step_count, recapture_count, closed_at from itap.authentication_sessions where id = '${id}'`))[0];
const eventsOf = (attempt: string | null) =>
  runSqlRows(`select event_type, severity, identity_id, profile_id, dedup_key, payload from itap.events
    where authentication_attempt_id = '${attempt}'`);

describe('auth_decide: identification', () => {
  it('should succeed, partially match or fail by the best template similarity and record the attempt', async () => {
    const w = await decideWorld();
    const s1 = await w.session();
    const ok = await decide(w.org, w.app.id, { session: s1, embedding: similarTo(0, 1, 0.8) });
    expect(ok).toMatchObject({
      outcome: 'success',
      matched_identity_id: w.person,
      profile_id: w.profile,
      failure_reason: null,
      retrieval_candidates: 1,
      retrieval_hit: null,
      population_size: 1,
    });
    expect(ok.confidence).toBeCloseTo(0.8, 4);
    expect(ok.comparison_score).toBeCloseTo(0.8, 4);
    const rec = await attemptRow(ok.attempt_id);
    expect(rec).toMatchObject({ outcome: 'success', session_id: s1, attempt_no: '1', step: 'initial', model_version: 'test_model' });
    expect(JSON.parse(rec.population_scope ?? '{}')).toMatchObject({ application_id: w.app.id });
    expect(rec.retrieval_ms).not.toBeNull();
    expect(rec.comparison_ms).not.toBeNull();
    expect(await sessionRow(s1)).toMatchObject({ status: 'succeeded', step_count: '1' });
    const [ev] = await eventsOf(ok.attempt_id);
    expect(ev).toMatchObject({ event_type: 'auth_success', identity_id: w.person, dedup_key: `auth:${ok.attempt_id}` });

    const s2 = await w.session();
    const partial = await decide(w.org, w.app.id, { session: s2, embedding: similarTo(0, 1, 0.55) });
    expect(partial).toMatchObject({ outcome: 'partial_match', matched_identity_id: w.person, failure_reason: null });
    expect(await sessionRow(s2)).toMatchObject({ status: 'open', step: 'recapture', step_count: '1' });
    expect(await eventsOf(partial.attempt_id)).toEqual([]);
    expect((await attemptRow(partial.attempt_id)).review_status).toBe('none');

    const s3 = await w.session();
    const miss = await decide(w.org, w.app.id, { session: s3, embedding: similarTo(0, 1, 0.3) });
    expect(miss).toMatchObject({ outcome: 'failure', failure_reason: 'below_threshold', matched_identity_id: null });
    expect(await sessionRow(s3)).toMatchObject({ status: 'failed' });
    const [failed] = await eventsOf(miss.attempt_id);
    expect(failed).toMatchObject({ event_type: 'auth_failed' });
  });

  it('should fail with not_retrieved when the population is empty', async () => {
    const w = await decideWorld();
    await runSql(`update itap.segment_members set removed_at = now() where segment_id = '${w.segment.id}'`);
    const d = await decide(w.org, w.app.id, { session: await w.session() });
    expect(d).toMatchObject({ outcome: 'failure', failure_reason: 'not_retrieved', population_size: 0, retrieval_candidates: 0 });
  });

  it('should send a partial match to review when no recapture is left, and emit auth_success on approval', async () => {
    const w = await decideWorld();
    const s = await w.session();
    const probe = similarTo(0, 1, 0.55);
    for (let i = 0; i < 2; i += 1) await decide(w.org, w.app.id, { session: s, embedding: probe });
    expect(await sessionRow(s)).toMatchObject({ status: 'open', step: 'recapture', recapture_count: '1' });
    const last = await decide(w.org, w.app.id, { session: s, embedding: probe });
    expect(last.outcome).toBe('partial_match');
    expect(await attemptRow(last.attempt_id)).toMatchObject({ review_status: 'pending', step: 'recapture', attempt_no: '3' });
    expect(await sessionRow(s)).toMatchObject({ status: 'review', recapture_count: '2' });
    await expect(decide(w.org, w.app.id, { session: s, embedding: probe })).rejects.toThrow(/auth_session_closed/);

    await w.a.request(
      `mutation($a: uuid!) { review_authentication_attempt(args: {p_attempt: $a, p_approve: true}) { id } }`,
      { a: last.attempt_id },
    );
    const [ev] = await eventsOf(last.attempt_id);
    expect(ev).toMatchObject({ event_type: 'auth_success', identity_id: w.person, dedup_key: `auth:${last.attempt_id}` });
    expect(await sessionRow(s)).toMatchObject({ status: 'succeeded' });
  });
});

describe('auth_decide: verification (Review Focus 2)', () => {
  it('should answer a claimed identity outside the population exactly like a non-match, recording the difference', async () => {
    const w = await decideWorld();
    const outsider = await faceIdentity(w.org, [axis(20)]);
    const verify = async (claimed: string, embedding: number[], bound: string | null = claimed) =>
      decide(w.org, w.app.id, {
        session: await w.session({ mode: 'verification', claimed_identity_id: bound }),
        mode: 'verification',
        claimed,
        embedding,
      });
    const success = await verify(w.person, similarTo(0, 1, 0.9));
    expect(success).toMatchObject({ outcome: 'success', matched_identity_id: w.person, retrieval_hit: true });
    const nonMatch = await verify(w.person, similarTo(0, 1, 0.1));
    const outside = await verify(outsider, axis(20));
    expect(publicPart(outside)).toEqual(publicPart(nonMatch));
    expect(outside).toMatchObject({ outcome: 'failure', failure_reason: 'below_threshold', confidence: null, retrieval_hit: null });
    expect(await attemptRow(nonMatch.attempt_id)).toMatchObject({ failure_reason: 'below_threshold', claimed_identity_id: w.person });
    const rec = await attemptRow(outside.attempt_id);
    expect(rec).toMatchObject({ failure_reason: 'not_in_population', claimed_identity_id: outsider, retrieval_hit: 'f' });
    expect(Number(rec.comparison_score)).toBeCloseTo(1, 4);
    // An identity of another organization is answered the same way and never stored.
    const foreign = await faceIdentity(w.orgB.id, [axis(21)]);
    const cross = await verify(foreign, axis(21), null);
    expect(publicPart(cross)).toEqual(publicPart(nonMatch));
    expect((await attemptRow(cross.attempt_id)).claimed_identity_id).toBe('NULL'); // run_sql renders null as 'NULL'
  });
});

describe('auth_decide: short-circuits and recording', () => {
  it('should fail on quality before matching and on attacks with the attack outcome', async () => {
    const w = await decideWorld();
    const s = await w.session();
    const blur = await decide(w.org, w.app.id, { session: s, embedding: null, quality: { failure_reason: 'blur' } });
    expect(blur).toMatchObject({ outcome: 'failure', failure_reason: 'blur', retrieval_candidates: null, comparison_score: null });
    expect(await sessionRow(s)).toMatchObject({ status: 'open', step: 'recapture' });
    const attack = await decide(w.org, w.app.id, { session: s, attack: { outcome: 'printed_photo', details: { motion: 0 } } });
    expect(attack).toMatchObject({ outcome: 'failure', failure_reason: 'attack_detected', attack_outcome: 'printed_photo', matched_identity_id: null });
    expect(await attemptRow(attack.attempt_id)).toMatchObject({ attack_outcome: 'printed_photo', step: 'recapture' });
    expect(await sessionRow(s)).toMatchObject({ status: 'failed' });
    const [ev] = await eventsOf(attack.attempt_id);
    expect(ev).toMatchObject({ event_type: 'auth_failed', severity: 'medium' });
    await expect(decide(w.org, w.app.id, { session: await w.session(), quality: { failure_reason: 'sunglasses' } })).rejects.toThrow(
      /auth_quality_reason_invalid/,
    );
  });

  it('should treat a sequence digest seen before as injection', async () => {
    const w = await decideWorld();
    const digest = `d-${Date.now()}`;
    const first = await decide(w.org, w.app.id, { session: await w.session(), attack: { sequence_digest: digest } });
    expect(first).toMatchObject({ outcome: 'success', attack_outcome: 'passed' });
    const replay = await decide(w.org, w.app.id, { session: await w.session(), attack: { sequence_digest: digest } });
    expect(replay).toMatchObject({ outcome: 'failure', failure_reason: 'attack_detected', attack_outcome: 'injection' });
    const rec = await attemptRow(replay.attempt_id);
    expect(JSON.parse(rec.attack_details ?? '{}')).toMatchObject({ replay_of_attempt_id: first.attempt_id });
    expect(await countRows('auth_sequence_digests', `organization_id = '${w.org}' and attempt_id = '${first.attempt_id}'`)).toBe(1);
  });

  it('should write nothing when p_record is false', async () => {
    const w = await decideWorld();
    const s = await w.session();
    const before = await sessionRow(s);
    const d = await decide(w.org, w.app.id, { session: s, record: false, attack: { sequence_digest: `x-${Date.now()}` } });
    expect(d).toMatchObject({ attempt_id: null, outcome: 'success' });
    const dry = await decide(w.org, w.app.id, { session: null, record: false });
    expect(dry.outcome).toBe('success');
    expect(await sessionRow(s)).toEqual(before);
    for (const table of ['authentication_attempts', 'auth_sequence_digests', 'events', 'access_decisions']) {
      expect(await countRows(table, `organization_id = '${w.org}'`), table).toBe(0);
    }
    await expect(decide(w.org, w.app.id, { session: null })).rejects.toThrow(/auth_session_required/);
  });

  it('should refuse bad sessions, modes and apps', async () => {
    const w = await decideWorld();
    const verifyOnly = await createApp(w.a);
    await bind(w.org, verifyOnly.id, { segments: [w.segment.id], modes: ['verification'] });
    await expect(decide(w.org, verifyOnly.id, { session: await w.session({ application_id: verifyOnly.id }) })).rejects.toThrow(
      /auth_mode_not_allowed/,
    );
    const expired = await w.session({ created_at: new Date(Date.now() - 600_000).toISOString(), expires_at: new Date(Date.now() - 1000).toISOString() });
    await expect(decide(w.org, w.app.id, { session: expired })).rejects.toThrow(/auth_session_expired/);
    const otherApp = await createApp(w.a);
    await expect(decide(w.org, otherApp.id, { session: await w.session() })).rejects.toThrow(/auth_session_not_found/);
    await expect(decide(w.org, w.app.id, { session: await w.session({ mode: 'verification', claimed_identity_id: w.person }) })).rejects.toThrow(
      /auth_session_mismatch/,
    );
    await expect(decide(w.org, w.app.id, { session: await w.session(), claimed: w.person })).rejects.toThrow(
      /auth_claimed_identity_not_allowed/,
    );
    await runSql(`update itap.client_applications set status = 'suspended' where id = '${w.app.id}'`);
    await expect(decide(w.org, w.app.id, { session: await w.session() })).rejects.toThrow(/client_application_inactive/);
  });
});

describe('auth_decide: populations and attributes', () => {
  it('should never let a sandbox app match a production identity, nor a production app a synthetic one (Review Focus 4)', async () => {
    const w = await decideWorld();
    const sandbox = await createApp(w.a, { is_sandbox: true });
    const idSegment = await manualSegment(w.a, 'identities');
    const synthetic = await faceIdentity(w.org, [axis(30)], { synthetic: true });
    await addSegmentRows(w.org, idSegment.id, 'identities', [synthetic, w.person]);
    await bind(w.org, sandbox.id, { segments: [idSegment.id, w.segment.id], modes: ['identification'] });
    await bind(w.org, w.app.id, { segments: [idSegment.id] });
    const sbSession = (): Promise<string> => w.session({ application_id: sandbox.id });
    expect(await decide(w.org, sandbox.id, { session: await sbSession(), embedding: axis(0) })).toMatchObject({
      outcome: 'failure',
      matched_identity_id: null,
      population_size: 1,
    });
    expect(await decide(w.org, sandbox.id, { session: await sbSession(), embedding: axis(30) })).toMatchObject({
      outcome: 'success',
      matched_identity_id: synthetic,
    });
    expect(await decide(w.org, w.app.id, { session: await w.session(), embedding: axis(30) })).toMatchObject({
      outcome: 'failure',
      matched_identity_id: null,
    });
  });

  it('should return exactly the permitted attributes, never the identity record (Review Focus 5)', async () => {
    const w = await decideWorld();
    await runSql(`update itap.profiles set department = 'Security', employee_id = 'E-7', email = 'ada@example.com'
      where id = '${w.profile}'`);
    await bind(w.org, w.app.id, { attributes: ['display_name', 'employee_id', 'segments', 'company'] });
    const d = await decide(w.org, w.app.id, { session: await w.session() });
    expect(Object.keys(d.attributes).sort()).toEqual(['company', 'display_name', 'employee_id', 'segments']);
    expect(d.attributes).toMatchObject({ display_name: 'Ada Access', employee_id: 'E-7', company: null });
    expect(d.attributes.segments).toEqual([expect.any(String)]);
    const none = await createApp(w.a);
    await bind(w.org, none.id, { segments: [w.segment.id], modes: ['identification'] });
    const bare = await decide(w.org, none.id, { session: await w.session({ application_id: none.id }) });
    expect(bare).toMatchObject({ outcome: 'success', attributes: {} });
    const miss = await decide(w.org, w.app.id, { session: await w.session(), embedding: axis(40) });
    expect(miss.attributes).toEqual({});
  });
});
