import { describe, expect, it } from 'vitest';
import { addSegmentRows, bind, decide, decideWorld, faceIdentity, similarTo } from './support/authDecide.js';
import { axis } from './support/faces.js';
import { manualSegment } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/**
 * Two-stage retrieval instrumentation: the claimed person X has five templates on axes 0..4 (centroid cos 0.447 to
 * axis 0); twenty decoys have one template each at cos 0.7 to axis 0. A probe on axis 0 matches X's first template
 * exactly, but stage 1 (top 20 by centroid) ranks all decoys above X.
 */
describe('auth_decide: two-stage retrieval', () => {
  it('should record retrieval_hit false when the claimed identity is not in the stage-1 top-K', async () => {
    const w = await decideWorld();
    const segment = await manualSegment(w.a, 'identities');
    await runSql(`update itap.segment_members set removed_at = now() where segment_id = '${w.segment.id}'`);
    const x = await faceIdentity(w.org, [0, 1, 2, 3, 4].map((i) => axis(i)), { link: true });
    const decoys: string[] = [];
    for (let k = 0; k < 20; k += 1) decoys.push(await faceIdentity(w.org, [similarTo(0, 10 + k, 0.7)], { link: true }));
    await addSegmentRows(w.org, segment.id, 'identities', [x, ...decoys]);
    await bind(w.org, w.app.id, { segments: [segment.id] });

    const verify = async () =>
      decide(w.org, w.app.id, {
        session: await w.session({ mode: 'verification', claimed_identity_id: x }),
        mode: 'verification',
        claimed: x,
        embedding: axis(0),
      });
    const missed = await verify();
    expect(missed).toMatchObject({
      outcome: 'success',
      matched_identity_id: x,
      retrieval_hit: false,
      retrieval_candidates: 20,
      population_size: 21,
    });
    expect(missed.comparison_score).toBeCloseTo(1, 4);

    // Identification with the same probe: stage 1 never retrieves X, stage 2 picks the best decoy.
    const ident = await decide(w.org, w.app.id, { session: await w.session(), embedding: axis(0) });
    expect(ident.retrieval_candidates).toBe(20);
    expect(ident.retrieval_hit).toBeNull();
    expect(decoys).toContain(ident.matched_identity_id);
    expect(ident.comparison_score).toBeCloseTo(0.7, 4);
    const [rec] = await runSqlRows(`select retrieval_hit, retrieval_candidates from itap.authentication_attempts where id = '${missed.attempt_id}'`);
    expect(rec).toMatchObject({ retrieval_hit: 'f', retrieval_candidates: '20' });

    // With one decoy fewer, X is within the top 20.
    await runSql(`update itap.segment_members set removed_at = now() where identity_id = '${decoys[0]}'`);
    expect(await verify()).toMatchObject({ outcome: 'success', retrieval_hit: true, retrieval_candidates: 20, population_size: 20 });
  });
});
