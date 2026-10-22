import { describe, expect, it } from 'vitest';
import {
  closedRing,
  isInsidePlan,
  outerRing,
  parsePoint,
  parseShape,
  shapeBounds,
  shapeLabelPoint,
  toPlanPoint,
  withOuterRing,
} from '../../src/fields/plan-geometry';

/** The plan-space helpers the shape and position fields and the floor-plan block share. */

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

describe('parseShape', () => {
  it('should read a polygon and a circle as stored', () => {
    expect(parseShape(square)).toEqual(square);
    expect(parseShape({ type: 'Circle', center: [5, 6], radius: 3 })).toEqual({
      type: 'Circle',
      center: [5, 6],
      radius: 3,
    });
  });

  it('should answer null for anything that is not a drawable shape', () => {
    for (const value of [
      null,
      'Polygon',
      { type: 'Polygon' },
      { type: 'Polygon', coordinates: [] },
      { type: 'Polygon', coordinates: [[[0, 0], [1]]] },
      { type: 'Circle', center: [1, 2] },
      { type: 'Square', coordinates: [] },
    ]) {
      expect(parseShape(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe('rings', () => {
  it('should drop the closing point of the outer ring and close it again', () => {
    const shape = parseShape(square);
    if (shape?.type !== 'Polygon') throw new Error('polygon expected');
    expect(outerRing(shape)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(closedRing(outerRing(shape))).toEqual(square.coordinates[0]);
    expect(
      closedRing([
        [1, 1],
        [2, 2],
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('should replace the outer ring and keep the holes', () => {
    const holed = parseShape({
      type: 'Polygon',
      coordinates: [
        square.coordinates[0],
        [
          [2, 2],
          [4, 2],
          [4, 4],
        ],
      ],
    });
    if (holed?.type !== 'Polygon') throw new Error('polygon expected');
    expect(
      withOuterRing(holed, [
        [0, 0],
        [20, 0],
        [20, 20],
      ]),
    ).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 0],
        ],
        [
          [2, 2],
          [4, 2],
          [4, 4],
        ],
      ],
    });
  });
});

describe('bounds, labels and the plan', () => {
  it('should bound a polygon and a circle', () => {
    expect(shapeBounds(parseShape(square)!)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(shapeBounds({ type: 'Circle', center: [5, 5], radius: 2 })).toEqual({
      minX: 3,
      minY: 3,
      maxX: 7,
      maxY: 7,
    });
  });

  it('should label a polygon at the centre of its outline and a circle at its centre', () => {
    expect(shapeLabelPoint(parseShape(square)!)).toEqual([5, 5]);
    expect(shapeLabelPoint({ type: 'Circle', center: [7, 8], radius: 1 })).toEqual([7, 8]);
  });

  it('should tell points inside the plan, edges included', () => {
    const size = { width: 100, height: 50 };
    expect(isInsidePlan([0, 0], size)).toBe(true);
    expect(isInsidePlan([100, 50], size)).toBe(true);
    expect(isInsidePlan([100.5, 10], size)).toBe(false);
    expect(isInsidePlan([10, -1], size)).toBe(false);
  });

  it('should turn a pointer position into a rounded plan point', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    const size = { width: 1200, height: 600 };
    expect(toPlanPoint({ clientX: 110, clientY: 70 }, rect, size)).toEqual([600, 300]);
    expect(toPlanPoint({ clientX: 10.1, clientY: 20 }, rect, size)).toEqual([1, 0]);
    // Outside the drawn image clamps to its edge.
    expect(toPlanPoint({ clientX: 500, clientY: 0 }, rect, size)).toEqual([1200, 0]);
    // An element without a size (not laid out) yields nothing.
    expect(toPlanPoint({ clientX: 1, clientY: 1 }, { ...rect, width: 0 }, size)).toBeNull();
  });

  it('should read a stored point', () => {
    expect(parsePoint([3, 4])).toEqual([3, 4]);
    expect(parsePoint({ x: 3, y: 4 })).toBeNull();
    expect(parsePoint([3])).toBeNull();
  });
});
