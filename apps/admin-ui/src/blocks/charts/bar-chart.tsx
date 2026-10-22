import type * as React from 'react';
import { CHART_HEIGHT as HEIGHT, CHART_WIDTH as WIDTH } from './chart-scale';

/** One column: its key, the value drawn up and (on a two-sided chart) the value drawn down. */
export interface BarPoint {
  readonly key: string;
  readonly up: number;
  readonly down?: number;
}

export interface BarChartProps {
  readonly points: readonly BarPoint[];
  readonly title: string;
  readonly summary?: string;
  readonly ariaLabel: string;
  /** The hover title of a column. */
  readonly describe: (point: BarPoint) => string;
  readonly start?: string;
  readonly end?: string;
  readonly testId: string;
}

/**
 * Counts per period as columns from a baseline; when any point has a `down` value, the chart is
 * two-sided: `up` above the middle line, `down` below it, on one scale (the larger maximum), as
 * the segment churn chart draws additions and removals. A hover title per column.
 */
export function BarChart({ points, title, summary, ariaLabel, describe, start, end, testId }: BarChartProps): React.ReactElement {
  const twoSided = points.some((point) => (point.down ?? 0) > 0);
  const base = twoSided ? HEIGHT / 2 : HEIGHT;
  const max = Math.max(...points.map((point) => Math.max(point.up, point.down ?? 0)), 0) || 1;
  const step = WIDTH / Math.max(points.length, 1);
  const bar = Math.max(step * 0.6, 1);
  const length = (value: number) => (value / max) * (base - 2);
  return (
    <figure className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {summary ? <span className="text-xs text-muted-foreground">{summary}</span> : null}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        <line x1={0} x2={WIDTH} y1={base} y2={base} className="stroke-border" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const left = index * step + (step - bar) / 2;
          const up = length(point.up);
          const down = length(point.down ?? 0);
          return (
            <g key={point.key}>
              {up > 0 ? <rect data-testid={`${testId}-up`} x={left} y={base - up} width={bar} height={up} className="fill-primary" /> : null}
              {down > 0 ? (
                <rect data-testid={`${testId}-down`} x={left} y={base} width={bar} height={down} className="fill-muted-foreground/60" />
              ) : null}
              <rect x={index * step} y={0} width={step} height={HEIGHT} className="fill-transparent hover:fill-foreground/5">
                <title>{describe(point)}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      {start || end ? (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{start}</span>
          <span>{end}</span>
        </div>
      ) : null}
    </figure>
  );
}
