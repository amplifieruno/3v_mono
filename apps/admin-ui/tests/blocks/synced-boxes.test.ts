import { describe, expect, it } from 'vitest';
import { BOX_HOLD_MS, boxesAt } from '../../src/blocks/live-camera/synced-boxes';
import type { DetectionMessage } from '../../src/realtime/detection-types';

const T0 = Date.parse('2026-11-26T12:00:00.000Z');

function detection(id: string, identityId: string | null, at: number, x: number): DetectionMessage {
  return {
    detectionId: id,
    deviceId: 'cam',
    identityId,
    identityCode: identityId ? 'IDENTITY-00001' : null,
    profileId: null,
    profileName: null,
    isNewIdentity: false,
    confidence: 0.9,
    bbox: { x, y: 10, width: 40, height: 40 },
    frameWidth: 1280,
    frameHeight: 720,
    detectedAt: new Date(T0 + at).toISOString(),
  };
}

describe('boxesAt', () => {
  it('should draw nothing before the frame a face was found on reaches the screen', () => {
    expect(boxesAt([detection('d1', 'a', 1_000, 100)], T0 + 999)).toEqual([]);
  });

  it('should move a face smoothly between the two frames it was found on', () => {
    const history = [detection('d1', 'a', 1_000, 100), detection('d2', 'a', 1_500, 200)];
    const [box] = boxesAt(history, T0 + 1_250);
    expect(box?.bbox.x).toBe(150);
    expect(box?.key).toBe('a');
    expect(box?.opacity).toBe(1);
  });

  it('should hold the last position, then fade it out and drop it', () => {
    const history = [detection('d1', 'a', 1_000, 100)];
    expect(boxesAt(history, T0 + 1_000 + BOX_HOLD_MS)[0]?.opacity).toBe(1);
    const fading = boxesAt(history, T0 + 1_000 + BOX_HOLD_MS + 150)[0]?.opacity ?? 0;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    expect(boxesAt(history, T0 + 1_000 + BOX_HOLD_MS + 400)).toEqual([]);
  });

  it('should not slide a face across a long gap between sightings', () => {
    const history = [detection('d1', 'a', 1_000, 100), detection('d2', 'a', 4_000, 900)];
    expect(boxesAt(history, T0 + 1_100)[0]?.bbox.x).toBe(100);
  });

  it('should keep faces of different people and unidentified faces apart', () => {
    const history = [detection('d1', 'a', 1_000, 100), detection('d2', 'b', 1_000, 500), detection('d3', null, 1_000, 900)];
    expect(boxesAt(history, T0 + 1_100).map((box) => box.key)).toEqual(['a', 'b', 'd3']);
  });

  it('should drop a face that a newer analysed frame did not find again (one face, one box)', () => {
    const history = [detection('d1', 'a', 1_000, 100), detection('d2', 'b', 1_500, 110)];
    expect(boxesAt(history, T0 + 1_600).map((box) => box.key)).toEqual(['b']);
  });
});
