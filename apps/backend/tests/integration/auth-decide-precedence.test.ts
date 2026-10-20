import { describe, expect, it } from 'vitest';
import { decide, decideWorld, faceIdentity } from './support/authDecide.js';
import { axis } from './support/faces.js';
import { runSqlRows } from './support/sql.js';

const attemptRow = async (id: string | null): Promise<Record<string, string | null>> =>
  (await runSqlRows(`select * from itap.authentication_attempts where id = '${id}'`))[0];
const sessionStatus = async (id: string): Promise<string | null> =>
  (await runSqlRows(`select status from itap.authentication_sessions where id = '${id}'`))[0].status;

describe('auth_decide: attack precedence (final review)', () => {
  it('should report an injection over a quality failure and close the session', async () => {
    const w = await decideWorld();
    const s = await w.session();
    const d = await decide(w.org, w.app.id, {
      session: s,
      embedding: null,
      quality: { failure_reason: 'blur' },
      attack: { outcome: 'injection', details: { reason: 'binding_mismatch' } },
    });
    expect(d).toMatchObject({ outcome: 'failure', failure_reason: 'attack_detected', attack_outcome: 'injection' });
    expect(await attemptRow(d.attempt_id)).toMatchObject({ failure_reason: 'attack_detected', attack_outcome: 'injection' });
    expect(await sessionStatus(s)).toBe('failed');
  });

  it('should treat a replayed sequence with a quality failure as an attack', async () => {
    const w = await decideWorld();
    const digest = `replay-${Date.now()}`;
    await decide(w.org, w.app.id, { session: await w.session(), attack: { outcome: 'passed', sequence_digest: digest } });
    const s = await w.session();
    const d = await decide(w.org, w.app.id, {
      session: s,
      embedding: null,
      quality: { failure_reason: 'no_face' },
      attack: { outcome: 'not_checked', sequence_digest: digest },
    });
    expect(d).toMatchObject({ outcome: 'failure', failure_reason: 'attack_detected', attack_outcome: 'injection' });
    expect(await sessionStatus(s)).toBe('failed');
  });
});

describe('auth_decide: verification outside the population (final review)', () => {
  it('should store no comparison score against a claimed identity outside the population', async () => {
    const w = await decideWorld();
    const outsider = await faceIdentity(w.org, [axis(22)]);
    const d = await decide(w.org, w.app.id, {
      session: await w.session({ mode: 'verification', claimed_identity_id: outsider }, outsider),
      mode: 'verification',
      claimed: outsider,
      embedding: axis(22),
    });
    expect(d).toMatchObject({ outcome: 'failure', failure_reason: 'below_threshold', comparison_score: null, confidence: null });
    const rec = await attemptRow(d.attempt_id);
    expect(rec).toMatchObject({ failure_reason: 'not_in_population', comparison_score: 'NULL', confidence: 'NULL' });
  });
});
