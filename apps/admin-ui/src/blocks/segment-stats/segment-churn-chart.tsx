import type * as React from 'react';
import { CHART_HEIGHT as HEIGHT, CHART_WIDTH as WIDTH, type SegmentStatsT, shortDay } from './segment-stats-format';
import type { SegmentStatPoint } from './segment-stats-series';

export interface SegmentChurnChartProps {
  readonly points: readonly SegmentStatPoint[];
  readonly t: SegmentStatsT;
}

/**
 * The churn per day: people added as bars above the middle line, people removed below it, on one
 * scale (the larger of the two maxima), a hover title per day. The window's totals are written
 * beside it.
 */
export function SegmentChurnChart({ points, t }: SegmentChurnChartProps): React.ReactElement {
  const middle = HEIGHT / 2;
  const max = Math.max(...points.map((point) => Math.max(point.added ?? 0, point.removed ?? 0)), 0) || 1;
  const step = WIDTH / Math.max(points.length, 1);
  const bar = Math.max(step * 0.6, 1);
  const length = (value: number) => (value / max) * (middle - 2);
  const added = points.reduce((sum, point) => sum + (point.added ?? 0), 0);
  const removed = points.reduce((sum, point) => sum + (point.removed ?? 0), 0);

  return (
    <figure className="flex flex-col gap-1" data-testid="segment-stats:churn">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{t('churn')}</span>
        <span className="text-xs text-muted-foreground">{t('totals', { params: { added, removed } })}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible"
        role="img"
        aria-label={t('churnChart')}
      >
        <line x1={0} x2={WIDTH} y1={middle} y2={middle} className="stroke-border" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const left = index * step + (step - bar) / 2;
          const up = length(point.added ?? 0);
          const down = length(point.removed ?? 0);
          return (
            <g key={point.day}>
              {up > 0 ? (
                <rect data-testid="segment-stats-added" x={left} y={middle - up} width={bar} height={up} className="fill-primary" />
              ) : null}
              {down > 0 ? (
                <rect data-testid="segment-stats-removed" x={left} y={middle} width={bar} height={down} className="fill-destructive" />
              ) : null}
              <rect x={index * step} y={0} width={step} height={HEIGHT} className="fill-transparent hover:fill-foreground/5">
                <title>
                  {point.added === null
                    ? t('noDay', { params: { day: shortDay(point.day) } })
                    : t('churnPoint', { params: { day: shortDay(point.day), added: point.added, removed: point.removed ?? 0 } })}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
