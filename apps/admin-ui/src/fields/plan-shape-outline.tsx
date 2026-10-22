import type * as React from 'react';
import { type PlanShape, outerRing, svgPoints } from './plan-geometry';

export interface PlanShapeOutlineProps {
  readonly shape: PlanShape;
  readonly className?: string;
  /** Shown as the shape's SVG `<title>` (its tooltip and accessible name). */
  readonly title?: string;
}

/** A shape drawn in plan coordinates: a circle, or a polygon's outline with its holes cut out. */
export function PlanShapeOutline({
  shape,
  className,
  title,
}: PlanShapeOutlineProps): React.ReactElement {
  const tooltip = title ? <title>{title}</title> : null;
  if (shape.type === 'Circle') {
    const [cx, cy] = shape.center;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={shape.radius}
        className={className}
        vectorEffect="non-scaling-stroke"
      >
        {tooltip}
      </circle>
    );
  }
  const rings = [outerRing(shape), ...shape.coordinates.slice(1)];
  const d = rings
    .filter((ring) => ring.length > 0)
    .map((ring) => `M${svgPoints(ring).replaceAll(' ', 'L')}Z`)
    .join(' ');
  return (
    <path d={d} fillRule="evenodd" className={className} vectorEffect="non-scaling-stroke">
      {tooltip}
    </path>
  );
}
