import { useT } from '@burojs/react';
import type * as React from 'react';
import type { ShapeHandle } from './area-shape-edit';
import { type PlanShape, type PlanSize, outerRing } from './plan-geometry';

export interface PlanShapeHandlesProps {
  readonly shape: PlanShape;
  readonly size: PlanSize;
  /** A handle pressed: the drag starts. */
  readonly onGrab: (handle: ShapeHandle) => void;
}

/** The draggable points of the shape being drawn: each outline point, or a circle's centre. */
export function PlanShapeHandles({
  shape,
  size,
  onGrab,
}: PlanShapeHandlesProps): React.ReactElement {
  const t = useT();
  // About 7 screen pixels on a plan drawn some 800 pixels wide.
  const r = Math.max(size.width, size.height) / 110;
  const grab =
    (handle: ShapeHandle) =>
    (event: React.PointerEvent<SVGCircleElement>): void => {
      event.stopPropagation();
      onGrab(handle);
    };
  const points =
    shape.type === 'Circle'
      ? [
          {
            point: shape.center,
            handle: { kind: 'center' } as const,
            label: t('console.areaShape.center'),
          },
        ]
      : outerRing(shape).map((point, index) => ({
          point,
          handle: { kind: 'vertex', index } as const,
          label: t('console.areaShape.point', { params: { index: index + 1 } }),
        }));
  return (
    <g>
      {points.map(({ point, handle, label }, index) => (
        <circle
          // Points have no identity of their own; the position is the key.
          key={index}
          cx={point[0]}
          cy={point[1]}
          r={r}
          className="cursor-grab fill-background stroke-primary stroke-2"
          vectorEffect="non-scaling-stroke"
          onPointerDown={grab(handle)}
          onClick={(event) => event.stopPropagation()}
        >
          <title>{label}</title>
        </circle>
      ))}
    </g>
  );
}
