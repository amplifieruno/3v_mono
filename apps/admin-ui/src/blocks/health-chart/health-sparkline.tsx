import type * as React from 'react';
import { type HealthChartT, formatMeasure } from './health-format';
import type { HealthMeasure, HealthPoint } from './health-series';

/** The drawing's own units; the SVG stretches to its box (strokes keep their width). */
const WIDTH = 480;
const HEIGHT = 64;

/** Percent measures share a fixed 0–100 scale; the others scale to their own maximum. */
const PERCENT: ReadonlySet<HealthMeasure> = new Set(['cpu', 'memory']);

/** The runs of consecutive buckets that have a value: a gap breaks the line. */
function runsOf(values: readonly (number | null)[]): { start: number; values: number[] }[] {
  const runs: { start: number; values: number[] }[] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.start + last.values.length === index) last.values.push(value);
    else runs.push({ start: index, values: [value] });
  });
  return runs;
}

export interface HealthSparklineProps {
  readonly measure: HealthMeasure;
  readonly points: readonly HealthPoint[];
  readonly t: HealthChartT;
}

/**
 * One measure over the window: a 2 px line over a faint area, on its own scale from 0, gaps
 * where no sample arrived, red ticks under periods with a failed check, and a hover title per
 * period giving its time and value. The latest value and the range are written beside it.
 */
export function HealthSparkline({ measure, points, t }: HealthSparklineProps): React.ReactElement {
  const values = points.map((point) => point[measure]);
  const present = values.filter((value): value is number => value !== null);
  const max = PERCENT.has(measure) ? 100 : Math.max(...present, 0) * 1.1 || 1;
  const step = WIDTH / Math.max(points.length, 1);
  const x = (index: number) => index * step + step / 2;
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 4);
  const runs = runsOf(values);
  const latest = present[present.length - 1];
  const label = t(measure);
  const time = (at: string) =>
    new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <figure className="flex flex-col gap-1" data-testid={`health-chart:${measure}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {latest === undefined ? null : t('latest', { params: { value: formatMeasure(measure, latest, t) } })}
          {present.length > 0
            ? ` · ${t('range', {
                params: {
                  min: formatMeasure(measure, Math.min(...present), t),
                  max: formatMeasure(measure, Math.max(...present), t),
                },
              })}`
            : null}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 6}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible"
        role="img"
        aria-label={t('chart', { params: { measure: label } })}
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT}
          y2={HEIGHT}
          className="stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        {runs.map((run) => {
          const coords = run.values.map((value, offset) => `${x(run.start + offset)},${y(value)}`);
          const first = x(run.start);
          const last = x(run.start + run.values.length - 1);
          return (
            <g key={run.start}>
              <path
                d={`M${first},${HEIGHT} L${coords.join(' L')} L${last},${HEIGHT} Z`}
                className="fill-primary/10"
              />
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
        {points.map((point, index) =>
          point.errors > 0 ? (
            <rect
              key={`error:${point.at}`}
              data-testid="health-chart-error"
              x={index * step + 0.5}
              y={HEIGHT + 2}
              width={Math.max(step - 1, 1)}
              height={4}
              className="fill-destructive"
            />
          ) : null,
        )}
        {points.map((point, index) => (
          <rect
            key={`hit:${point.at}`}
            x={index * step}
            y={0}
            width={step}
            height={HEIGHT + 6}
            className="fill-transparent hover:fill-foreground/5"
          >
            <title>
              {t('point', {
                params: {
                  time: time(point.at),
                  value:
                    point[measure] === null ? '—' : formatMeasure(measure, point[measure] ?? 0, t),
                },
              })}
              {point.errors > 0 ? ` · ${t('errors')}: ${point.errors}` : ''}
            </title>
          </rect>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('ago')}</span>
        <span>{t('now')}</span>
      </div>
    </figure>
  );
}
