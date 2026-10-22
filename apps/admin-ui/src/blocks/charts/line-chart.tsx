import type * as React from 'react';
import { CHART_HEIGHT as HEIGHT, CHART_WIDTH as WIDTH, chartLabel, formatFigure, runsOf, scaleMax } from './chart-scale';
import { ChartTable } from './chart-table';

/** One point of a series: its key, how it is named on hover, and its value (`null` = no figure). */
export interface ChartPoint {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
}

export interface LineChartProps {
  readonly points: readonly ChartPoint[];
  /** The caption above the drawing. */
  readonly title: string;
  /** Written beside the caption (latest value, range, total). */
  readonly summary?: string;
  /** What the drawing shows; its accessible name adds the axis ends and the summary. */
  readonly ariaLabel: string;
  /** The header of the period column of the chart's data table ("Day", "Hour"). */
  readonly axisLabel: string;
  /** The ends of the time axis, written under the drawing. */
  readonly start?: string;
  readonly end?: string;
  readonly format?: (value: number) => string;
  readonly testId?: string;
}

/**
 * A series over time as a 2 px line over a faint area from 0 (the health chart's drawing), on its
 * own scale, with gaps where a point has no figure and a hover title per point.
 */
export function LineChart({
  points,
  title,
  summary,
  ariaLabel,
  axisLabel,
  start,
  end,
  format = formatFigure,
  testId,
}: LineChartProps): React.ReactElement {
  const values = points.map((point) => point.value);
  const max = scaleMax(values);
  const step = WIDTH / Math.max(points.length, 1);
  const x = (index: number) => index * step + step / 2;
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 4);
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
        aria-label={chartLabel(ariaLabel, start, end, summary)}
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-border" vectorEffect="non-scaling-stroke" />
        {runsOf(values).map((run) => {
          const coords = run.values.map((value, offset) => `${x(run.start + offset)},${y(value)}`);
          const first = x(run.start);
          const last = x(run.start + run.values.length - 1);
          return (
            <g key={run.start}>
              <path d={`M${first},${HEIGHT} L${coords.join(' L')} L${last},${HEIGHT} Z`} className="fill-primary/10" />
              {run.values.length === 1 ? (
                <circle cx={first} cy={y(run.values[0] ?? 0)} r={2} className="fill-primary" />
              ) : (
                <path
                  d={`M${coords.join(' L')}`}
                  className="fill-none stroke-primary stroke-2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
        {points.map((point, index) => (
          <rect
            key={`hit:${point.key}`}
            x={index * step}
            y={0}
            width={step}
            height={HEIGHT}
            className="fill-transparent hover:fill-foreground/5"
          >
            <title>{`${point.label}: ${point.value === null ? '—' : format(point.value)}`}</title>
          </rect>
        ))}
      </svg>
      <ChartTable
        testId={testId === undefined ? undefined : `${testId}-table`}
        caption={ariaLabel}
        columns={[axisLabel, title]}
        rows={points.map((point) => ({
          key: point.key,
          header: point.label,
          cells: [point.value === null ? '—' : format(point.value)],
        }))}
      />
      {start || end ? (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{start}</span>
          <span>{end}</span>
        </div>
      ) : null}
    </figure>
  );
}
