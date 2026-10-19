import { describe, expect, it } from 'vitest';
import { buildHealthHistory, HISTORY_HOURS, lastWholeHour, type Incident } from './deviceHealthPlan.js';

const NOW = new Date('2026-10-19T09:41:12.345Z');
const HOUR_MS = 3_600_000;

describe('lastWholeHour', () => {
  it('should return the whole hour strictly before now', () => {
    expect(lastWholeHour(NOW).toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(lastWholeHour(new Date('2026-10-19T09:00:00.000Z')).toISOString()).toBe('2026-10-19T08:00:00.000Z');
  });
});

describe('buildHealthHistory', () => {
  it('should plan one sample per whole hour for 30 days, all before now, oldest first', () => {
    const { metrics, events } = buildHealthHistory('nova/Lobby Camera', 'camera', NOW, []);
    expect(metrics).toHaveLength(HISTORY_HOURS);
    expect(events).toEqual([]);
    const times = metrics.map((m) => new Date(m.recorded_at).getTime());
    expect(times.every((t) => t % HOUR_MS === 0 && t < NOW.getTime())).toBe(true);
    expect(times.at(-1)).toBe(lastWholeHour(NOW).getTime());
    expect(times[0]).toBe(lastWholeHour(NOW).getTime() - (HISTORY_HOURS - 1) * HOUR_MS);
    expect(new Set(times).size).toBe(HISTORY_HOURS);
  });

  it('should give cameras latency but no frame rate and no host metrics (like the live probe)', () => {
    const { metrics } = buildHealthHistory('nova/Lobby Camera', 'camera', NOW, []);
    for (const m of metrics) {
      expect(m.cpu_usage).toBeNull();
      expect(m.frame_rate).toBeNull();
      expect(m.network_latency_ms).toBeGreaterThan(0);
      expect(m.error_count).toBe(0);
    }
  });

  it('should give terminals and sensors plausible host metrics', () => {
    const { metrics } = buildHealthHistory('nova/Reception Kiosk', 'host', NOW, []);
    for (const m of metrics) {
      for (const v of [m.cpu_usage, m.memory_usage, m.disk_usage]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(m.frame_rate).toBeNull();
    }
  });

  it('should record an offline incident with matching offline/online events', () => {
    const incident: Incident = { device: 'x', startHoursAgo: 50, hours: 3, reason: 'test' };
    const camera = buildHealthHistory('nova/x', 'camera', NOW, [incident]);
    const last = lastWholeHour(NOW).getTime();
    const at = (hoursAgo: number) => new Date(last - hoursAgo * HOUR_MS).toISOString();
    expect(camera.events.map((e) => [e.kind, e.occurred_at])).toEqual([
      ['offline', at(50)],
      ['online', at(47)],
    ]);
    const down = camera.metrics.filter((m) => m.error_count === 1);
    expect(down.map((m) => m.recorded_at)).toEqual([at(50), at(49), at(48)]);
    expect(down.every((m) => m.network_latency_ms === null && m.frame_rate === null)).toBe(true);

    // A host sends no heartbeat while offline.
    const host = buildHealthHistory('nova/x', 'host', NOW, [incident]);
    expect(host.metrics).toHaveLength(HISTORY_HOURS - 3);
    expect(host.metrics.some((m) => m.recorded_at === at(49))).toBe(false);
  });

  it('should be deterministic for the same key and now', () => {
    expect(buildHealthHistory('nova/a', 'host', NOW, [])).toEqual(buildHealthHistory('nova/a', 'host', NOW, []));
    expect(buildHealthHistory('nova/a', 'host', NOW, [])).not.toEqual(buildHealthHistory('nova/b', 'host', NOW, []));
  });
});

describe('buildHealthHistory: incidents through record_device_health', () => {
  it('should plan the offline/online calls instead of direct events and keep the offline gap', () => {
    const incident: Incident = { device: 'x', startHoursAgo: 50, hours: 3, reason: 'test', viaPipeline: true };
    const plan = buildHealthHistory('nova/x', 'host', NOW, [incident]);
    const last = lastWholeHour(NOW).getTime();
    expect(plan.events).toEqual([]);
    expect(plan.pipeline).toEqual([
      { reachable: false, at: new Date(last - 50 * HOUR_MS).toISOString() },
      { reachable: true, at: new Date(last - 47 * HOUR_MS).toISOString() },
    ]);
    const times = new Set(plan.metrics.map((m) => m.recorded_at));
    for (const h of [50, 49, 48]) expect(times.has(new Date(last - h * HOUR_MS).toISOString())).toBe(false);
  });

  it('should route the Parking Gate Terminal outage of Nova Tower through record_device_health', async () => {
    const { NOVA_INCIDENTS } = await import('./deviceHealthPlan.js');
    expect(NOVA_INCIDENTS.filter((i) => i.viaPipeline).map((i) => i.device)).toEqual(['Parking Gate Terminal']);
  });
});
