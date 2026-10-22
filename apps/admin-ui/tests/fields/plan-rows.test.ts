import { describe, expect, it } from 'vitest';
import {
  applyClick,
  applyDrag,
  defaultRadius,
  removeLastPoint,
} from '../../src/fields/area-shape-edit';
import { parseShape } from '../../src/fields/plan-geometry';
import {
  type FloorPlanRow,
  areaChain,
  areasOnPlan,
  floorPlanOf,
  planAreaOf,
  planOfChain,
  rowsOf,
} from '../../src/fields/plan-rows';

/**
 * Which floor plan a place lies on (the place's own plan, else its nearest enclosing area's,
 * as the data layer's floor_plans comment says) and how clicks and drags edit a shape.
 */

const SIZE = { width: 1200, height: 800 } as const;
const plan = (id: string, areaId: string): FloorPlanRow => ({
  id,
  facility_id: 'f',
  area_id: areaId,
  name: id,
  image_file_id: null,
  size: SIZE,
});

const AREAS = rowsOf(
  [
    { id: 'tower', name: 'Tower', path: ['tower'] },
    {
      id: 'floor',
      name: 'Floor',
      path: ['tower', 'floor'],
      shape: { type: 'Circle', center: [1, 1], radius: 1 },
    },
    { id: 'wing', name: 'Wing', path: ['tower', 'floor', 'wing'] },
    {
      id: 'room',
      name: 'Room',
      path: ['tower', 'floor', 'wing', 'room'],
      shape: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
          ],
        ],
      },
    },
    {
      id: 'other',
      name: 'Other',
      path: ['tower', 'other'],
      shape: { type: 'Circle', center: [1, 1], radius: 1 },
    },
    { name: 'no id' },
  ],
  planAreaOf,
);

describe('which plan a place lies on', () => {
  it('should walk outwards from the place to the nearest area with a plan', () => {
    const plans = [plan('p-floor', 'floor'), plan('p-tower', 'tower')];
    expect(areaChain(null, 'room', AREAS)).toEqual(['room', 'wing', 'floor', 'tower']);
    expect(planOfChain(areaChain(null, 'room', AREAS), plans)?.id).toBe('p-floor');
    expect(planOfChain(areaChain(null, 'other', AREAS), plans)?.id).toBe('p-tower');
  });

  it('should put the edited area itself first, so a floor is drawn on its own plan', () => {
    const plans = [plan('p-floor', 'floor'), plan('p-tower', 'tower')];
    expect(areaChain('floor', 'tower', AREAS)).toEqual(['floor', 'tower']);
    expect(planOfChain(areaChain('floor', 'tower', AREAS), plans)?.id).toBe('p-floor');
    // A new area (no id yet) inside the wing uses the floor's plan.
    expect(planOfChain(areaChain(null, 'wing', AREAS), plans)?.id).toBe('p-floor');
  });

  it('should find no plan when nothing outwards carries one', () => {
    expect(planOfChain(areaChain(null, 'room', AREAS), [plan('p', 'other')])).toBeNull();
    expect(areaChain(null, null, AREAS)).toEqual([]);
    // A start area missing from the rows read still counts itself.
    expect(areaChain(null, 'ghost', AREAS)).toEqual(['ghost']);
  });

  it('should list the shaped areas inside the plan’s area, the area included', () => {
    const floor = plan('p-floor', 'floor');
    expect(areasOnPlan(AREAS, floor, [floor]).map((area) => area.id)).toEqual(['floor', 'room']);
    // The plan itself counts even when the facility's plans were not read.
    expect(areasOnPlan(AREAS, floor, []).map((area) => area.id)).toEqual(['floor', 'room']);
    expect(AREAS).toHaveLength(5);
  });

  it('should draw an area only on its nearest plan when plans nest', () => {
    const tower = plan('p-tower', 'tower');
    const floor = plan('p-floor', 'floor');
    const wing = plan('p-wing', 'wing');
    const ids = (onPlan: readonly { id: string }[]) => onPlan.map((area) => area.id);
    // The floor carries its own plan, the room lies on the floor's: the tower plan keeps "other".
    expect(ids(areasOnPlan(AREAS, tower, [tower, floor]))).toEqual(['other']);
    expect(ids(areasOnPlan(AREAS, floor, [tower, floor]))).toEqual(['floor', 'room']);
    // A plan on the wing takes the room away from the floor.
    expect(ids(areasOnPlan(AREAS, floor, [tower, floor, wing]))).toEqual(['floor']);
    expect(ids(areasOnPlan(AREAS, wing, [tower, floor, wing]))).toEqual(['room']);
  });

  it('should refuse plan rows without a positive size', () => {
    const row = { id: 'p', facility_id: 'f', area_id: 'a', name: 'P', width_px: 10, height_px: 20 };
    expect(floorPlanOf(row)?.size).toEqual({ width: 10, height: 20 });
    expect(floorPlanOf({ ...row, width_px: 0 })).toBeNull();
    expect(floorPlanOf(null)).toBeNull();
  });
});

describe('editing a shape', () => {
  it('should add polygon points in order and close the outline from the third', () => {
    let shape = applyClick(null, 'polygon', [10, 10], SIZE);
    shape = applyClick(shape, 'polygon', [100, 10], SIZE);
    expect(shape).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [100, 10],
        ],
      ],
    });
    shape = applyClick(shape, 'polygon', [100, 100], SIZE);
    expect(shape).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [100, 10],
          [100, 100],
          [10, 10],
        ],
      ],
    });
  });

  it('should start a circle at the click and set its radius with the next one', () => {
    const start = applyClick(null, 'circle', [600, 400], SIZE);
    expect(start).toEqual({ type: 'Circle', center: [600, 400], radius: defaultRadius(SIZE) });
    expect(applyClick(start, 'circle', [630, 440], SIZE)).toEqual({
      type: 'Circle',
      center: [600, 400],
      radius: 50,
    });
    // A polygon click replaces a circle.
    expect(applyClick(start, 'polygon', [1, 1], SIZE)).toEqual({
      type: 'Polygon',
      coordinates: [[[1, 1]]],
    });
  });

  it('should move a dragged point or centre and keep holes', () => {
    const holed = parseShape({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [3, 2],
          [3, 3],
        ],
      ],
    });
    expect(applyDrag(holed, { kind: 'vertex', index: 0 }, [1, 1])).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [1, 1],
          [10, 0],
          [10, 10],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 2],
          [3, 3],
        ],
      ],
    });
    expect(applyDrag(holed, { kind: 'vertex', index: 9 }, [1, 1])).toBe(holed);
    expect(
      applyDrag({ type: 'Circle', center: [5, 5], radius: 2 }, { kind: 'center' }, [7, 8]),
    ).toEqual({
      type: 'Circle',
      center: [7, 8],
      radius: 2,
    });
  });

  it('should remove the last point, down to no shape', () => {
    const triangle = applyClick(
      applyClick(applyClick(null, 'polygon', [0, 0], SIZE), 'polygon', [5, 0], SIZE),
      'polygon',
      [5, 5],
      SIZE,
    );
    const two = removeLastPoint(triangle);
    expect(two).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [5, 0],
        ],
      ],
    });
    expect(removeLastPoint(removeLastPoint(two))).toBeNull();
  });
});
