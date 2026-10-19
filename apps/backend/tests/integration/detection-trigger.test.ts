import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { orgEvents, types } from './support/stageB.js';
import { createTrackingWorld, detect } from './support/tracking.js';

/** Polls `check` every 250 ms until it returns true or `timeoutMs` passes. */
async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return check();
}

describe('detection_created event trigger (Hasura -> backend -> evaluate_detection)', () => {
  beforeAll(requireBackend);

  it('should produce the Stage B events of an inserted detection without a direct call', async () => {
    const w = await createTrackingWorld();
    const d = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    const arrived = await waitFor(async () => (await orgEvents(w.orgA.id)).some((e) => e.detection_id === d.id));
    expect(arrived).toBe(true);
    expect(types(await orgEvents(w.orgA.id))).toEqual(['detection_unknown']);
  });
});
