import type { HealthMeasure } from './health-series';

/** The block's `t`, as its view receives it. */
export type HealthChartT = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

const UNIT_KEY: Readonly<Record<HealthMeasure, string>> = {
  cpu: 'unitPercent',
  memory: 'unitPercent',
  latency: 'unitMs',
  frameRate: 'unitFps',
};

/** A value in the measure's unit, rounded for reading. */
export function formatMeasure(measure: HealthMeasure, value: number, t: HealthChartT): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return t(UNIT_KEY[measure], { params: { value: rounded } });
}
