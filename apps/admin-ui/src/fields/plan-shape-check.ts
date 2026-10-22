import type { FieldProblem } from './field-issue';
import { type PlanSize, isInsidePlan, parsePoint, shapeBounds } from './plan-geometry';

/**
 * The checks of plan-space values, before any request. The structure mirrors the database
 * (`itap.valid_shape`, `itap.valid_point`, migrations `create_validation_helpers` and
 * `count_distinct_shape_points`): exactly the keys of the type, at least one ring, every point
 * two numbers, at least 3 distinct points per ring, a radius above 0. The console also keeps
 * every point (and a circle's whole disc) on the floor-plan image when the plan is known (`size`); the database cannot,
 * as a shape does not name its plan.
 */

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sizeParams = (size: PlanSize) => ({ width: size.width, height: size.height });

const NOT_SHAPE: FieldProblem = {
  code: 'areaShape.notShape',
  text: 'A shape must be a polygon or a circle.',
};

function unexpectedKeys(
  shape: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): FieldProblem | null {
  const extra = Object.keys(shape).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return null;
  const keys = extra.join(', ');
  return {
    code: 'areaShape.unexpectedKeys',
    text: `The shape has unexpected keys (${keys}).`,
    params: { keys },
  };
}

function checkCircle(
  shape: Readonly<Record<string, unknown>>,
  size: PlanSize | null,
): FieldProblem | null {
  const extra = unexpectedKeys(shape, ['type', 'center', 'radius']);
  if (extra) return extra;
  const center = parsePoint(shape.center);
  if (center === null)
    return { code: 'areaShape.badCenter', text: 'A circle needs a centre point [x, y].' };
  if (typeof shape.radius !== 'number' || !(shape.radius > 0)) {
    return { code: 'areaShape.badRadius', text: 'A circle needs a radius greater than 0.' };
  }
  if (size === null) return null;
  const radius = shape.radius;
  const box = shapeBounds({ type: 'Circle', center, radius });
  if (!isInsidePlan([box.minX, box.minY], size) || !isInsidePlan([box.maxX, box.maxY], size)) {
    const [x, y] = center;
    return {
      code: 'areaShape.circleOutside',
      text: `The circle (centre ${x}, ${y}, radius ${radius}) reaches outside the floor plan (${size.width} × ${size.height} px).`,
      params: { x, y, radius, ...sizeParams(size) },
    };
  }
  return null;
}

function checkRing(ring: unknown, size: PlanSize | null): FieldProblem | null {
  if (!Array.isArray(ring)) return NOT_SHAPE;
  const distinct = new Set<string>();
  for (const [offset, raw] of ring.entries()) {
    const index = offset + 1;
    const point = parsePoint(raw);
    if (point === null) {
      return {
        code: 'areaShape.badPoint',
        text: `Point ${index} is not a pair of numbers.`,
        params: { index },
      };
    }
    if (size !== null && !isInsidePlan(point, size)) {
      const [x, y] = point;
      return {
        code: 'areaShape.outside',
        text: `Point ${index} (${x}, ${y}) lies outside the floor plan (${size.width} × ${size.height} px).`,
        params: { index, x, y, ...sizeParams(size) },
      };
    }
    distinct.add(`${point[0]},${point[1]}`);
  }
  return distinct.size < 3
    ? {
        code: 'areaShape.tooFewPoints',
        text: 'A shape needs at least 3 different points; add more points or clear the shape.',
      }
    : null;
}

/** The first problem of a shape value (`null` = no shape, allowed), or `null` when it can be saved. */
export function validateShape(value: unknown, size: PlanSize | null): FieldProblem | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) return NOT_SHAPE;
  if (value.type === 'Circle') return checkCircle(value, size);
  if (value.type !== 'Polygon') return NOT_SHAPE;
  const extra = unexpectedKeys(value, ['type', 'coordinates']);
  if (extra) return extra;
  if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) return NOT_SHAPE;
  for (const ring of value.coordinates) {
    const problem = checkRing(ring, size);
    if (problem) return problem;
  }
  return null;
}

/** The problem of a position value (`null` = not placed, allowed), or `null` when it can be saved. */
export function validatePlanPoint(value: unknown, size: PlanSize | null): FieldProblem | null {
  if (value === null || value === undefined) return null;
  const point = parsePoint(value);
  if (point === null)
    return { code: 'planPosition.notPoint', text: 'A position must be a point [x, y].' };
  if (size !== null && !isInsidePlan(point, size)) {
    const [x, y] = point;
    return {
      code: 'planPosition.outside',
      text: `The position (${x}, ${y}) lies outside the floor plan (${size.width} × ${size.height} px).`,
      params: { x, y, ...sizeParams(size) },
    };
  }
  return null;
}
