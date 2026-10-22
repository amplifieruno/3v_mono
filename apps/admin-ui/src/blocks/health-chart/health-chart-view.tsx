import type { BlockViewProps } from '@burojs/react';
import type * as React from 'react';
import type { healthChartBlock } from './health-chart-block';
import { HEALTH_MEASURES, type HealthSeries, healthSeries } from './health-series';
import { HealthErrorStrip } from './health-error-strip';
import { HealthSparkline } from './health-sparkline';

/**
 * The health chart block's view (`itap:health-chart`): one sparkline per measure the device
 * reported in the window, and a note on the red failed-check marks when there are any. A window
 * of failed checks without any measure (offline all day) shows the failed checks alone.
 */
export function HealthChartView({
  data,
  t,
}: BlockViewProps<typeof healthChartBlock>): React.ReactElement {
  const parsed = healthSeries.safeParse((data as { readonly series?: unknown }).series);
  const series: HealthSeries | null = parsed.success ? parsed.data : null;
  const points = series?.points ?? [];
  const measures = HEALTH_MEASURES.filter((measure) =>
    points.some((point) => point[measure] !== null),
  );
  const failed = points.some((point) => point.errors > 0);

  if (!points.some((point) => point.samples > 0)) {
    return (
      <p data-testid="health-chart" className="text-sm text-muted-foreground">
        {t('none')}
      </p>
    );
  }
  if (measures.length === 0) {
    // Samples but no measure (failed checks only): the failed checks, not an empty grid.
    return (
      <section data-testid="health-chart" aria-label={t('label')}>
        {failed ? (
          <HealthErrorStrip points={points} t={t} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        )}
      </section>
    );
  }
  return (
    <section data-testid="health-chart" className="flex flex-col gap-4" aria-label={t('label')}>
      <div className="grid gap-4 md:grid-cols-2">
        {measures.map((measure) => (
          <HealthSparkline key={measure} measure={measure} points={points} t={t} />
        ))}
      </div>
      {failed ? <p className="text-xs text-muted-foreground">{t('errorsHint')}</p> : null}
    </section>
  );
}
