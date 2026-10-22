import { z } from 'zod';

/** How far back the health chart reaches. */
export const HEALTH_WINDOW_HOURS = 24;

/** One point of the chart per this many minutes (96 over 24 h). */
export const HEALTH_BUCKET_MINUTES = 15;

/**
 * The most samples the chart reads: a camera checked every minute writes 1440 a day; the rest
 * is headroom for a retried check.
 */
export const HEALTH_SAMPLE_LIMIT = 2000;

/** One health sample as the chart reads it. */
export const healthSample = z.object({
  recorded_at: z.string(),
  cpu_usage: z.number().nullable(),
  memory_usage: z.number().nullable(),
  network_latency_ms: z.number().nullable(),
  frame_rate: z.number().nullable(),
  error_count: z.number(),
});

export type HealthSample = z.infer<typeof healthSample>;

/** The measures the chart draws, one small chart each (never two scales on one axis). */
export const HEALTH_MEASURES = ['cpu', 'memory', 'latency', 'frameRate'] as const;

export type HealthMeasure = (typeof HEALTH_MEASURES)[number];

/** One bucket: the mean of each measure over its samples (null without any), and the errors. */
export const healthPoint = z.object({
  at: z.string(),
  samples: z.number(),
  errors: z.number(),
  cpu: z.number().nullable(),
  memory: z.number().nullable(),
  latency: z.number().nullable(),
  frameRate: z.number().nullable(),
});

export type HealthPoint = z.infer<typeof healthPoint>;

/** The chart's data: the window and one point per bucket, oldest first, empty buckets included. */
export const healthSeries = z.object({
  since: z.string(),
  until: z.string(),
  points: z.array(healthPoint),
});

export type HealthSeries = z.infer<typeof healthSeries>;

const MEASURE_COLUMN: Readonly<Record<HealthMeasure, keyof HealthSample>> = {
  cpu: 'cpu_usage',
  memory: 'memory_usage',
  latency: 'network_latency_ms',
  frameRate: 'frame_rate',
};

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * The samples of the window ending at `until` folded into buckets of `bucketMinutes`: each
 * bucket holds the mean of every measure over the samples that have it, so a camera (latency
 * only) and a terminal (host figures) chart the same way, and the errors summed. Samples outside
 * the window are ignored. A bucket without samples is kept, with nulls, so gaps stay visible.
 */
export function bucketHealth(
  samples: readonly HealthSample[],
  until: Date,
  hours: number = HEALTH_WINDOW_HOURS,
  bucketMinutes: number = HEALTH_BUCKET_MINUTES,
): HealthSeries {
  const bucketMs = bucketMinutes * 60_000;
  const count = Math.ceil((hours * 60) / bucketMinutes);
  const end = until.getTime();
  const start = end - count * bucketMs;
  const groups: HealthSample[][] = Array.from({ length: count }, () => []);
  for (const sample of samples) {
    const at = Date.parse(sample.recorded_at);
    if (Number.isNaN(at) || at < start || at > end) continue;
    groups[Math.min(count - 1, Math.floor((at - start) / bucketMs))]?.push(sample);
  }
  const points = groups.map((group, index): HealthPoint => {
    const measure = (name: HealthMeasure) =>
      mean(
        group
          .map((sample) => sample[MEASURE_COLUMN[name]])
          .filter((value): value is number => typeof value === 'number'),
      );
    return {
      at: new Date(start + index * bucketMs).toISOString(),
      samples: group.length,
      errors: group.reduce((sum, sample) => sum + sample.error_count, 0),
      cpu: measure('cpu'),
      memory: measure('memory'),
      latency: measure('latency'),
      frameRate: measure('frameRate'),
    };
  });
  return { since: new Date(start).toISOString(), until: until.toISOString(), points };
}
