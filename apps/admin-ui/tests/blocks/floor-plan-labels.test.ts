import { describe, expect, it } from 'vitest';
import type { PlanShape } from '../../src/fields/plan-geometry';
import {
  type AreaToLabel,
  type LabelPlacement,
  insideShape,
  markerBox,
  placeAreaLabels,
  placePointLabels,
} from '../../src/blocks/floor-plan/floor-plan-labels';

/**
 * Label placement on the floor plan: area labels apart from each other, from the markers and
 * from the shapes inside their area; marker names beside their icons, apart and on the plan.
 */

const FONT = 17;
const rect = (x: number, y: number, w: number, h: number): PlanShape => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ],
});
const area = (id: string, shape: PlanShape, path: string[] = ['floor', id]): AreaToLabel => ({
  id,
  path,
  shape,
  lines: [id, '0 / 10'],
});

describe('placeAreaLabels', () => {
  it('should keep a lone area’s label at its middle', () => {
    const { placements } = placeAreaLabels([area('Hall', rect(0, 0, 400, 300))], [], FONT);
    expect(placements.get('Hall')?.place.x).toBe(200);
    expect(Math.abs((placements.get('Hall')?.place.y ?? 0) - 150)).toBeLessThan(FONT);
  });

  it('should move apart the labels of two shapes with the same middle', () => {
    const dock = area('Loading Dock', rect(880, 60, 280, 220));
    const fence = area('Loading Dock Geofence', {
      type: 'Circle',
      center: [1020, 170],
      radius: 140,
    });
    const { boxes } = placeAreaLabels([dock, fence], [], FONT);
    const [a, b] = boxes;
    const apart =
      a!.maxY <= b!.minY || b!.maxY <= a!.minY || a!.maxX <= b!.minX || b!.maxX <= a!.minX;
    expect(apart).toBe(true);
  });

  it('should keep an area’s label off a marker at its middle', () => {
    const marker = markerBox([220, 570], 20);
    const { boxes } = placeAreaLabels([area('Reception', rect(60, 460, 320, 220))], [marker], FONT);
    const box = boxes[0]!;
    const overlaps =
      box.minX < marker.maxX &&
      marker.minX < box.maxX &&
      box.minY < marker.maxY &&
      marker.minY < box.maxY;
    expect(overlaps).toBe(false);
  });

  it('should put a parent’s label on one line in the strip its rooms leave free', () => {
    const suite = area('Suite 1201 (Aurora Analytics)', rect(40, 40, 440, 720));
    const rooms = [
      area('Open Office', rect(60, 60, 400, 400), ['floor', suite.id, 'Open Office']),
      area('Meeting Room', rect(60, 480, 190, 240), ['floor', suite.id, 'Meeting Room']),
      area('Kitchen', rect(270, 480, 190, 240), ['floor', suite.id, 'Kitchen']),
    ];
    const { placements } = placeAreaLabels([suite, ...rooms], [], FONT);
    const label = placements.get(suite.id);
    expect(label?.lines).toEqual(['Suite 1201 (Aurora Analytics) · 0 / 10']);
    expect(label?.place.y).toBeGreaterThan(720);
  });
});

describe('placePointLabels', () => {
  const size = { width: 1200, height: 800 };
  const markers = [480, 560, 640, 720].map((x) => markerBox([x, 440], 20));
  const turnstiles = [480, 560, 640, 720].map((x, i) => ({
    id: `t${i}`,
    position: [x, 440] as const,
    text: `Turnstile ${i + 1}`,
  }));

  it('should name a lone marker to the right of its icon', () => {
    const placements = placePointLabels([turnstiles[0]!], [markers[0]!], [], 20, 12, size);
    expect(placements.get('t0')).toMatchObject({ anchor: 'start' });
    expect(placements.get('t0')!.x).toBeGreaterThan(500);
  });

  it('should spread the names of markers in a row so none covers another', () => {
    const placements = placePointLabels(turnstiles, markers, [], 20, 12, size);
    const sides = turnstiles.map((t) => placements.get(t.id) as LabelPlacement);
    expect(sides.map((s) => s.anchor)).toEqual(['end', 'middle', 'middle', 'start']);
  });

  it('should turn a name at the plan’s right edge to the left', () => {
    const placements = placePointLabels(
      [{ id: 'cam', position: [1180, 250], text: 'Loading Dock Camera' }],
      [markerBox([1180, 250], 20)],
      [],
      20,
      12,
      size,
    );
    expect(placements.get('cam')?.anchor).toBe('end');
  });
});

describe('insideShape', () => {
  it('should tell points inside polygons and circles', () => {
    expect(insideShape([5, 5], rect(0, 0, 10, 10))).toBe(true);
    expect(insideShape([15, 5], rect(0, 0, 10, 10))).toBe(false);
    expect(insideShape([3, 4], { type: 'Circle', center: [0, 0], radius: 5 })).toBe(true);
    expect(insideShape([4, 4], { type: 'Circle', center: [0, 0], radius: 5 })).toBe(false);
  });
});
