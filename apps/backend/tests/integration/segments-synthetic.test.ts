import { describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { axis } from './support/faces.js';
import { asActor, dynamicSegment, evaluate, openRows, preview, segmentWorld, syncMembers } from './support/segments.js';
import { at } from './support/tracking.js';

/** Final review of slice 9: synthetic (face auth sandbox) identities never become dynamic segment members. */
describe('segments: synthetic identities', () => {
  it('should leave synthetic identities out of dynamic identity segments (evaluation and sync)', async () => {
    const w = await segmentWorld();
    const synthetic = await faceIdentity(w.orgA.id, [axis(30)], { synthetic: true });
    const segment = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });

    const previewed = await preview(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 }, 100);
    expect(previewed.sample_ids).toContain(w.identity);
    expect(previewed.sample_ids).not.toContain(synthetic);
    await evaluate(w.a, segment.id);
    const members = (await openRows(segment.id)).map(([id]) => id);
    expect(members).toContain(w.identity);
    expect(members).not.toContain(synthetic);

    // A stale or hand-built id list cannot add one either: sync drops synthetic ids like merged ones.
    const actor = asActor(w.orgA.id, w.user.id);
    const result = await syncMembers(actor, segment.id, [w.identity, synthetic], at(86400 * 400));
    expect(result.stale).toBe(false);
    expect((await openRows(segment.id)).map(([id]) => id)).not.toContain(synthetic);
  });
});
