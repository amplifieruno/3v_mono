import {
  type CircleShape,
  type PlanPoint,
  type PlanShape,
  type PlanSize,
  distance,
  outerRing,
  withOuterRing,
} from './plan-geometry';

/** How a click on the plan changes the shape being drawn. */
export type ShapeMode = 'polygon' | 'circle';

/** What is being dragged: a polygon outline point (by index) or a circle's centre. */
export type ShapeHandle =
  | { readonly kind: 'vertex'; readonly index: number }
  | { readonly kind: 'center' };

/** The radius a new circle starts with: a twentieth of the plan's shorter side, at least 1 px. */
export const defaultRadius = (size: PlanSize): number =>
  Math.max(1, Math.round(Math.min(size.width, size.height) / 20));

/** The outline points of a polygon value, none for a circle or nothing. */
export function ringOf(shape: PlanShape | null): PlanPoint[] {
  return shape?.type === 'Polygon' ? outerRing(shape) : [];
}

/**
 * A click in a mode: a polygon gets the point appended to its outline (a circle is replaced by
 * a new outline); a circle gets its radius set to the clicked distance, or starts at the point.
 */
export function applyClick(
  shape: PlanShape | null,
  mode: ShapeMode,
  point: PlanPoint,
  size: PlanSize,
): PlanShape {
  if (mode === 'polygon') {
    const polygon = shape?.type === 'Polygon' ? shape : null;
    return withOuterRing(polygon, [...ringOf(polygon), point]);
  }
  if (shape?.type === 'Circle') {
    return { ...shape, radius: Math.max(1, Math.round(distance(shape.center, point))) };
  }
  return { type: 'Circle', center: point, radius: defaultRadius(size) } satisfies CircleShape;
}

/** The shape with the dragged handle moved to `point`. */
export function applyDrag(
  shape: PlanShape | null,
  handle: ShapeHandle,
  point: PlanPoint,
): PlanShape | null {
  if (shape === null) return null;
  if (handle.kind === 'center')
    return shape.type === 'Circle' ? { ...shape, center: point } : shape;
  if (shape.type !== 'Polygon') return shape;
  const ring = outerRing(shape);
  if (handle.index < 0 || handle.index >= ring.length) return shape;
  return withOuterRing(
    shape,
    ring.map((current, index) => (index === handle.index ? point : current)),
  );
}

/** The polygon without its last outline point; `null` once no point is left. */
export function removeLastPoint(shape: PlanShape | null): PlanShape | null {
  const ring = ringOf(shape);
  if (shape?.type !== 'Polygon' || ring.length <= 1) return null;
  return withOuterRing(shape, ring.slice(0, -1));
}
