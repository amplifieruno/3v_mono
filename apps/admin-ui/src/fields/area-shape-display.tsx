import { type ScalarDisplayProps, useT } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { AreaShapeMeta } from './area-shape-meta';
import { outerRing, parseShape, shapeBounds } from './plan-geometry';
import { PlanShapeOutline } from './plan-shape-outline';

/**
 * A small preview of the outline, scaled to fit (not over its plan), with what it is
 * (`Polygon, 4 points`, `Circle, radius 140 px`); no shape reads as a dash.
 */
export function AreaShapeDisplay(
  props: ScalarDisplayProps<unknown, AreaShapeMeta>,
): React.ReactElement {
  const t = useT();
  const shape = parseShape(props.value);
  if (shape === null) return <span className="text-muted-foreground">—</span>;
  const box = shapeBounds(shape);
  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1) * 0.08;
  const viewBox = [
    box.minX - pad,
    box.minY - pad,
    box.maxX - box.minX + 2 * pad,
    box.maxY - box.minY + 2 * pad,
  ];
  const summary =
    shape.type === 'Circle'
      ? t('console.areaShape.circle', { params: { radius: shape.radius } })
      : t('console.areaShape.points', { params: { count: outerRing(shape).length } });
  const plain = props.presentation === 'plain';
  return (
    <span className="inline-flex items-center gap-2" data-testid={props.testIds.display}>
      <svg
        viewBox={viewBox.join(' ')}
        aria-hidden
        className={cn('shrink-0', plain ? 'h-5 w-8' : 'h-12 w-16 rounded-sm border bg-muted/30')}
      >
        <PlanShapeOutline shape={shape} className="fill-primary/20 stroke-primary stroke-[1.5]" />
      </svg>
      <span className="text-sm">{summary}</span>
    </span>
  );
}
