import { describe, expect, it } from 'vitest';
import { HASURA_OPERATIONS } from '../../src/modules';
import { type HealthSample, bucketHealth } from '../../src/blocks/health-chart/health-series';

/** The health chart's data: samples of the last 24 h folded into 15-minute points. */

const UNTIL = new Date('2026-10-22T12:00:00.000Z');

const sample = (at: string, over: Partial<HealthSample> = {}): HealthSample => ({
  recorded_at: at,
  cpu_usage: null,
  memory_usage: null,
  network_latency_ms: null,
  frame_rate: null,
  error_count: 0,
  ...over,
});

describe('bucketHealth', () => {
  it('should cover the window with 96 points, oldest first, empty ones included', () => {
    const series = bucketHealth([], UNTIL);
    expect(series.points).toHaveLength(96);
    expect(series.since).toBe('2026-10-21T12:00:00.000Z');
    expect(series.points[0]?.at).toBe('2026-10-21T12:00:00.000Z');
    expect(series.points[95]?.at).toBe('2026-10-22T11:45:00.000Z');
    expect(series.points.every((point) => point.samples === 0 && point.latency === null)).toBe(true);
  });

  it('should average each measure over the samples that have it and sum the errors', () => {
    const series = bucketHealth(
      [
        sample('2026-10-22T11:46:00Z', { network_latency_ms: 10 }),
        sample('2026-10-22T11:50:00Z', { network_latency_ms: 30, cpu_usage: 40 }),
        sample('2026-10-22T11:59:00Z', { error_count: 1 }),
        sample('2026-10-22T12:00:00Z', { network_latency_ms: 50 }),
      ],
      UNTIL,
    );
    const last = series.points[95];
    expect(last).toMatchObject({ samples: 4, errors: 1, latency: 30, cpu: 40, memory: null });
  });

  it('should end the window on the next quarter-hour, so a refetch keeps the same buckets', () => {
    const early = bucketHealth([], new Date('2026-10-22T12:01:00.000Z'));
    const late = bucketHealth([], new Date('2026-10-22T12:14:30.000Z'));
    expect(early.until).toBe('2026-10-22T12:15:00.000Z');
    expect(late.since).toBe(early.since);
    expect(late.points.map((point) => point.at)).toEqual(early.points.map((point) => point.at));
    const sampled = bucketHealth(
      [sample('2026-10-22T12:03:00Z', { network_latency_ms: 8 })],
      new Date('2026-10-22T12:05:00.000Z'),
    );
    expect(sampled.points.at(-1)).toMatchObject({ at: '2026-10-22T12:00:00.000Z', latency: 8 });
  });

  it('should ignore samples outside the window', () => {
    const series = bucketHealth(
      [sample('2026-10-21T11:59:00Z', { network_latency_ms: 5 }), sample('2026-10-22T12:01:00Z')],
      UNTIL,
    );
    expect(series.points.reduce((sum, point) => sum + point.samples, 0)).toBe(0);
  });

  it('should read the last 24 h of one device newest first and bucket them oldest first', () => {
    const entry = HASURA_OPERATIONS['health-chart']?.deviceHealthSeries;
    const before = Date.now();
    const variables = entry?.variables?.({ deviceId: 'd1' }) as Record<string, unknown>;
    expect(variables.device).toBe('d1');
    const since = Date.parse(String(variables.since));
    expect(before - since).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(before - since).toBeLessThanOrEqual(24 * 3_600_000 + 1000);
    // Newest first: past the limit, the oldest samples are the ones left out.
    expect(entry?.document).toContain('order_by: [{ recorded_at: desc }]');
    const mapped = entry?.mapResult?.({
      device_health_metrics: [
        sample(new Date().toISOString(), { network_latency_ms: 12 }),
        sample(new Date(Date.now() - 3 * 3_600_000).toISOString(), { network_latency_ms: 40 }),
      ],
    }) as { points: { latency: number | null }[] };
    const latencies = mapped.points.map((point) => point.latency).filter((value) => value !== null);
    expect(latencies).toEqual([40, 12]);
  });
});
