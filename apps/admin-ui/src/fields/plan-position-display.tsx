import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { parsePoint } from './plan-geometry';
import type { PlanPositionMeta } from './plan-position-meta';

/** The point's plan coordinates (`x 120, y 340 px`); not placed reads as a dash. */
export function PlanPositionDisplay(
  props: ScalarDisplayProps<unknown, PlanPositionMeta>,
): React.ReactElement {
  const t = useT();
  const point = parsePoint(props.value);
  if (point === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums" data-testid={props.testIds.display}>
      {t('console.planPosition.at', { params: { x: point[0], y: point[1] } })}
    </span>
  );
}
