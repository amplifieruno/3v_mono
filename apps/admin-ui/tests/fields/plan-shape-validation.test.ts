import { afterEach, describe, expect, it } from 'vitest';
import { areaShape, checkAreaShape } from '../../src/fields/area-shape';
import { problemIssue } from '../../src/fields/field-issue';
import { checkPlanPosition, planPosition } from '../../src/fields/plan-position';
import { validatePlanPoint, validateShape } from '../../src/fields/plan-shape-check';
import { publishPlanSize } from '../../src/fields/plan-size-registry';
import { expectTranslated, issueText, validatorResult } from '../support/field-issues';

/**
 * Review Focus 3: a polygon with fewer than 3 points, or a point outside the floor-plan image,
 * cannot be saved. The structural rules mirror `itap.valid_shape` / `itap.valid_point`; the
 * image bounds come from the floor plan the mounted input resolved (published by the input).
 */

const SIZE = { width: 1200, height: 800 } as const;
const polygon = (...points: readonly (readonly [number, number])[]) => ({
  type: 'Polygon',
  coordinates: [[...points]],
});

let withdraw: (() => void) | null = null;
afterEach(() => {
  withdraw?.();
  withdraw = null;
});

describe('shape validation (mirrors itap.valid_shape)', () => {
  it('should refuse a polygon with fewer than 3 distinct points', async () => {
    for (const value of [
      polygon([0, 0], [10, 0]),
      polygon([0, 0], [10, 0], [0, 0]),
      polygon([0, 0], [10, 0], [10, 0], [0, 0]),
    ]) {
      const problem = validateShape(value, null);
      expect(problem?.code, JSON.stringify(value)).toBe('areaShape.tooFewPoints');
      if (problem)
        expect(await expectTranslated(problem)).toBe(
          'A shape needs at least 3 different points; add more points or clear the shape.',
        );
    }
    expect(validateShape(polygon([0, 0], [10, 0], [10, 10]), null)).toBeNull();
    expect(validateShape(polygon([0, 0], [10, 0], [10, 10], [0, 0]), null)).toBeNull();
  });

  it('should refuse values the database refuses', async () => {
    const refused: readonly unknown[] = [
      'square',
      { type: 'Polygon', coordinates: [] },
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 'a'],
            [2, 2],
          ],
        ],
      },
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
        ],
        extra: 1,
      },
      { type: 'Circle', center: [1, 1], radius: 0 },
      { type: 'Circle', center: [1], radius: 5 },
      { type: 'Square' },
    ];
    for (const value of refused) {
      const problem = validateShape(value, null);
      expect(problem, JSON.stringify(value)).not.toBeNull();
      if (problem) await expectTranslated(problem);
    }
    expect(validateShape(null, null)).toBeNull();
    expect(validateShape({ type: 'Circle', center: [1, 1], radius: 2.5 }, null)).toBeNull();
  });

  it('should refuse a point outside the floor-plan image', async () => {
    const outside = validateShape(polygon([0, 0], [1300, 0], [10, 10]), SIZE);
    expect(outside?.code).toBe('areaShape.outside');
    if (outside) {
      expect(await expectTranslated(outside)).toBe(
        'Point 2 (1300, 0) lies outside the floor plan (1200 × 800 px).',
      );
    }
    const circle = validateShape({ type: 'Circle', center: [-5, 10], radius: 3 }, SIZE);
    expect(circle?.code).toBe('areaShape.circleOutside');
    // The whole disc must lie on the plan, not only its centre.
    const edge = validateShape({ type: 'Circle', center: [1150, 400], radius: 60 }, SIZE);
    expect(edge?.code).toBe('areaShape.circleOutside');
    if (edge) {
      expect(await expectTranslated(edge)).toBe(
        'The circle (centre 1150, 400, radius 60) reaches outside the floor plan (1200 × 800 px).',
      );
    }
    expect(validateShape({ type: 'Circle', center: [1140, 400], radius: 60 }, SIZE)).toBeNull();
    expect(validateShape(polygon([0, 0], [1200, 0], [1200, 800]), SIZE)).toBeNull();
  });

  it('should check the bounds the mounted input published, through the field validator', async () => {
    const field = areaShape({ areaField: 'parent_id', selfIsArea: true });
    const validate = checkAreaShape(field.meta.channel);
    const value = polygon([0, 0], [1300, 0], [10, 10]);
    // No input mounted: only the structure is checked (the database checks no bounds either).
    expect(await validatorResult(validate, value)).toBeNull();
    withdraw = publishPlanSize(field.meta.channel, SIZE);
    const problem = validateShape(value, SIZE);
    expect(await validatorResult(validate, value)).toEqual(problemIssue(problem!));
    expect(issueText(await validatorResult(validate, polygon([0, 0], [1, 1])))).toContain(
      'at least 3',
    );
    expect(await validatorResult(validate, null)).toBeNull();
  });
});

describe('position validation (mirrors itap.valid_point)', () => {
  it('should refuse a malformed point and one outside the image', async () => {
    expect(validatePlanPoint({ x: 1, y: 2 }, null)?.code).toBe('planPosition.notPoint');
    expect(validatePlanPoint([1, 2, 3], null)?.code).toBe('planPosition.notPoint');
    const outside = validatePlanPoint([10, 900], SIZE);
    expect(outside?.code).toBe('planPosition.outside');
    for (const problem of [validatePlanPoint('x', null), outside])
      if (problem) await expectTranslated(problem);
    expect(validatePlanPoint([10, 800], SIZE)).toBeNull();
    expect(validatePlanPoint(null, SIZE)).toBeNull();
  });

  it('should check the published bounds through the field validator', async () => {
    const field = planPosition({ areaField: 'area_id' });
    const validate = checkPlanPosition(field.meta.channel);
    expect(await validatorResult(validate, [5000, 1])).toBeNull();
    withdraw = publishPlanSize(field.meta.channel, SIZE);
    expect(issueText(await validatorResult(validate, [5000, 1]))).toContain(
      'outside the floor plan',
    );
  });
});
