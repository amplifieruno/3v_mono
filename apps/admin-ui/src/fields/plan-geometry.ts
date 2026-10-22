/**
 * Floor-plan pixel space (`tasks/data-layer/design.md` §6.0, migration
 * `create_validation_helpers`): a point is `[x, y]`, an area or coverage shape is
 * `{ type: 'Polygon', coordinates: [outline, ...holes] }` or
 * `{ type: 'Circle', center: [x, y], radius }`, both in the pixels of the floor plan's image.
 */

export type PlanPoint = readonly [number, number];

export interface PolygonShape {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly PlanPoint[])[];
}

export interface CircleShape {
  readonly type: 'Circle';
  readonly center: PlanPoint;
  readonly radius: number;
}

export type PlanShape = PolygonShape | CircleShape;

/** The image size of a floor plan (`width_px`, `height_px`). */
export interface PlanSize {
  readonly width: number;
  readonly height: number;
}

export interface PlanBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A stored `[x, y]` point, or `null` for anything else. */
export function parsePoint(value: unknown): PlanPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value as unknown[];
  return isNumber(x) && isNumber(y) ? [x, y] : null;
}

/**
 * A stored shape in a form that can be drawn: a polygon of point rings (at least one) or a
 * circle with a positive radius; `null` otherwise. It does not count distinct points; that
 * is the validator's (`./plan-shape-check.ts`).
 */
export function parseShape(value: unknown): PlanShape | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const shape = value as Readonly<Record<string, unknown>>;
  if (shape.type === 'Circle') {
    const center = parsePoint(shape.center);
    return center !== null && isNumber(shape.radius) && shape.radius > 0
      ? { type: 'Circle', center, radius: shape.radius }
      : null;
  }
  if (shape.type !== 'Polygon' || !Array.isArray(shape.coordinates)) return null;
  if (shape.coordinates.length === 0) return null;
  const rings: PlanPoint[][] = [];
  for (const ring of shape.coordinates as unknown[]) {
    if (!Array.isArray(ring)) return null;
    const points = ring.map(parsePoint);
    if (points.some((point) => point === null)) return null;
    rings.push(points as PlanPoint[]);
  }
  return { type: 'Polygon', coordinates: rings };
}

const samePoint = (a: PlanPoint, b: PlanPoint): boolean => a[0] === b[0] && a[1] === b[1];

/** The polygon's outline without its closing point (the point equal to the first, if any). */
export function outerRing(shape: PolygonShape): PlanPoint[] {
  const ring = [...(shape.coordinates[0] ?? [])];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first !== undefined && last !== undefined && samePoint(first, last))
    ring.pop();
  return ring;
}

/** The ring closed GeoJSON-style (last point = first) once it has 3 points; shorter rings as they are. */
export function closedRing(ring: readonly PlanPoint[]): PlanPoint[] {
  const first = ring[0];
  return ring.length >= 3 && first !== undefined ? [...ring, first] : [...ring];
}

/** The polygon with a new outline (closed), its holes kept as stored. */
export function withOuterRing(
  shape: PolygonShape | null,
  ring: readonly PlanPoint[],
): PolygonShape {
  return {
    type: 'Polygon',
    coordinates: [closedRing(ring), ...(shape?.coordinates.slice(1) ?? [])],
  };
}

/** The smallest box holding the shape (a polygon's outline, a circle's disc). */
export function shapeBounds(shape: PlanShape): PlanBounds {
  if (shape.type === 'Circle') {
    const [x, y] = shape.center;
    return {
      minX: x - shape.radius,
      minY: y - shape.radius,
      maxX: x + shape.radius,
      maxY: y + shape.radius,
    };
  }
  const ring = outerRing(shape);
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Where a shape's label goes: a circle's centre, the middle of a polygon's outline box. */
export function shapeLabelPoint(shape: PlanShape): PlanPoint {
  if (shape.type === 'Circle') return shape.center;
  const box = shapeBounds(shape);
  return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
}

/** Whether a point lies on the image (its edges included). */
export function isInsidePlan(point: PlanPoint, size: PlanSize): boolean {
  return point[0] >= 0 && point[1] >= 0 && point[0] <= size.width && point[1] <= size.height;
}

/** The SVG `points` attribute of a ring. */
export const svgPoints = (ring: readonly PlanPoint[]): string =>
  ring.map(([x, y]) => `${x},${y}`).join(' ');

/** The distance between two points. */
export const distance = (a: PlanPoint, b: PlanPoint): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The plan point under a pointer: the drawn image's box (`getBoundingClientRect`) scaled to the
 * plan's pixels, rounded to whole pixels and clamped to the image. `null` when the box has no
 * size (not laid out).
 */
export function toPlanPoint(
  pointer: { readonly clientX: number; readonly clientY: number },
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  size: PlanSize,
): PlanPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const clamp = (value: number, max: number): number =>
    Math.min(max, Math.max(0, Math.round(value)));
  return [
    clamp(((pointer.clientX - rect.left) / rect.width) * size.width, size.width),
    clamp(((pointer.clientY - rect.top) / rect.height) * size.height, size.height),
  ];
}
