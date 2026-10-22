import type * as React from 'react';
import { CHART_HEIGHT as HEIGHT, CHART_WIDTH as WIDTH, type SegmentStatsT, runsOf, shortDay } from './segment-stats-format';
import type { SegmentStatPoint } from './segment-stats-series';

export interface SegmentMembersChartProps {
  readonly points: readonly SegmentStatPoint[];
  readonly t: SegmentStatsT;
}

/**
 * The member count per day: a 2 px line over a faint area from 0 (the health chart's drawing),
 * gaps on days without figures, and a hover title per day. The latest count and the range are
 * written beside it.
 */
export function SegmentMembersChart({ points, t }: SegmentMembersChartProps): React.ReactElement {
  const values = points.map((point) => point.members);
  const present = values.filter((value): value is number => value !== null);
  const max = Math.max(...present, 0) * 1.1 || 1;
  const step = WIDTH / Math.max(points.length, 1);
  const x = (index: number) => index * step + step / 2;
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 4);
  const latest = present[present.length - 1];

  return (
    <figure className="flex flex-col gap-1" data-testid="segment-stats:members">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{t('members')}</span>
        <span className="text-xs text-muted-foreground">
          {latest === undefined ? null : t('latest', { params: { value: latest } })}
          {present.length > 0
            ? ` · ${t('range', { params: { min: Math.min(...present), max: Math.max(...present) } })}`
            : null}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible"
        role="img"
        aria-label={t('membersChart')}
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
            key={`hit:${point.day}`}
            x={index * step}
            y={0}
            width={step}
            height={HEIGHT}
            className="fill-transparent hover:fill-foreground/5"
          >
            <title>
              {point.members === null
                ? t('noDay', { params: { day: shortDay(point.day) } })
                : t('membersPoint', { params: { day: shortDay(point.day), value: point.members } })}
            </title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
