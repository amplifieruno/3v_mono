import type * as React from 'react';
import type { HealthChartT } from './health-format';
import type { HealthPoint } from './health-series';

const WIDTH = 480;
const HEIGHT = 12;

export interface HealthErrorStripProps {
  readonly points: readonly HealthPoint[];
  readonly t: HealthChartT;
}

/**
 * The window when the device reported no measure at all (a camera offline all day: its failed
 * checks carry no latency): one strip marking the periods with a failed check, and their total.
 */
export function HealthErrorStrip({ points, t }: HealthErrorStripProps): React.ReactElement {
  const step = WIDTH / Math.max(points.length, 1);
  const total = points.reduce((sum, point) => sum + point.errors, 0);
  const time = (at: string) =>
    new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <figure className="flex flex-col gap-1" data-testid="health-chart:errors">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{t('errors')}</span>
        <span className="text-xs text-muted-foreground">{t('errorsTotal', { params: { count: total } })}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-3 w-full"
        role="img"
        aria-label={t('errorsStrip')}
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="fill-muted" />
        {points.map((point, index) =>
          point.errors > 0 ? (
            <rect
              key={point.at}
              data-testid="health-chart-error"
              x={index * step + 0.5}
              y={0}
              width={Math.max(step - 1, 1)}
              height={HEIGHT}
              className="fill-destructive"
            >
              <title>{`${time(point.at)} · ${t('errors')}: ${point.errors}`}</title>
            </rect>
          ) : null,
        )}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('ago')}</span>
        <span>{t('now')}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t('noMeasures')}</p>
    </figure>
  );
}
