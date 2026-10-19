import { describe, expect, it } from 'vitest';
import { buildDayMutation, type ResolvedPoint } from './historyMutation.js';
import type { PlannedDetection } from './historyScripts.js';

const point: ResolvedPoint = { device_id: 'dev', area_id: 'area', access_point_id: 'ap' };
const MIN = 60_000;
const START = Date.parse('2026-10-01T01:00:00Z');

function detection(identityId: string, offsetMs: number): PlannedDetection {
  return {
    identityId,
    point: 'entrance',
    at: START + offsetMs,
    similarity: 0.7,
    confidence: 0.95,
    quality: 0.8,
    bbox: { x: 1, y: 2, width: 100, height: 125 },
  };
}

describe('buildDayMutation', () => {
  const day = { date: '2026-10-01', start: START, end: START + 24 * 60 * MIN };
  const detections = [detection('b', 1 * MIN), detection('a', 2 * MIN), detection('a', 12 * MIN + 1), detection('c', 12 * MIN)];
  let n = 0;
  const built = buildDayMutation({ organization: 'org', day, detections, resolve: () => point, newId: () => `det-${++n}` });

  it('should run dwell rules, stale sessions, the window insert and its evaluations per 5-minute window in order', () => {
    const fields = [...built.query.matchAll(/(\w+): (\w+)\(/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(fields).toEqual([
      'dw0:evaluate_dwell_rules',
      'cs0:close_stale_sessions',
      'in0:insert_detections',
      'e0_0:evaluate_detection',
      'e0_1:evaluate_detection',
      'dw1:evaluate_dwell_rules',
      'cs1:close_stale_sessions',
      'in1:insert_detections',
      'e1_0:evaluate_detection',
      'e1_1:evaluate_detection',
      'dwEnd:evaluate_dwell_rules',
      'csEnd:close_stale_sessions',
      'lifecycle:run_lifecycle_jobs',
      'notifications:seed_finalize_notifications',
      'stats:aggregate_stats_range',
    ]);
    // Window times: start of the 5-minute window that holds the detections; the day closes at its end.
    expect(built.query).toContain(`p_at: "${new Date(START).toISOString()}"`);
    expect(built.query).toContain(`p_at: "${new Date(START + 10 * MIN).toISOString()}"`);
    expect(built.query).toContain(`p_at: "${new Date(day.end).toISOString()}"`);
    // The day's notification rows are dated at their simulated times in the same transaction.
    expect(built.query).toContain(`seed_finalize_notifications(args: { p_organization: $org, p_until: "${new Date(day.end).toISOString()}" })`);
    // The day's stats, so area_transitions_daily is there when later days are evaluated (abnormal_movement).
    expect(built.query).toContain(
      `aggregate_stats_range(args: { p_organization: $org, p_from: "${new Date(START).toISOString()}", p_to: "${new Date(day.end).toISOString()}" })`,
    );
  });

  it('should insert each window sorted by identity then time and evaluate in time order', () => {
    const first = built.variables.w0 as { identity_id: string; detected_at: string; id: string }[];
    expect(first.map((r) => r.identity_id)).toEqual(['a', 'b']);
    const second = built.variables.w1 as { identity_id: string }[];
    expect(second.map((r) => r.identity_id)).toEqual(['a', 'c']);
    // Evaluation follows time order: b (1 min) before a (2 min).
    const b = first.find((r) => r.identity_id === 'b')?.id;
    const a = first.find((r) => r.identity_id === 'a')?.id;
    expect(built.query.indexOf(`"${b}"`)).toBeLessThan(built.query.indexOf(`"${a}"`));
    expect(built.detections).toBe(4);
  });

  it('should write detection rows with the resolved camera point and frame size', () => {
    const [row] = built.variables.w0 as Record<string, unknown>[];
    expect(row).toMatchObject({
      organization_id: 'org',
      device_id: 'dev',
      area_id: 'area',
      access_point_id: 'ap',
      frame_width: 1920,
      frame_height: 1080,
      bbox: { x: 1, y: 2, width: 100, height: 125 },
    });
  });
});
