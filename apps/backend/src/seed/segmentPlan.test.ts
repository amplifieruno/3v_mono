import { describe, expect, it } from 'vitest';
import { localDate, localMinutes } from './historyTime.js';
import {
  executiveMembers,
  frequentVisitorPin,
  novaSegments,
  riversideSegments,
  SEGMENT_EVENT_RULE,
  SEGMENT_NAMES,
  SEGMENT_NOTIFICATION_RULE,
  SEGMENT_TEMPLATES,
  segmentHistoryTimes,
  type SegmentSpec,
} from './segmentPlan.js';

const TZ = 'Europe/Moscow';
const NOW = Date.parse('2026-10-19T09:00:00Z');
const DAY = 86_400_000;
const CREATED = NOW - 33 * DAY;
const REFS = { nightShiftSchedule: 'schedule-night', fitOutCompany: 'company-lumen' };

/** Every leaf of a condition tree. */
function leaves(node: unknown): { field: string; operator: string; value: unknown }[] {
  if (typeof node !== 'object' || node === null) return [];
  const n = node as { children?: unknown[]; field?: string; operator?: string; value?: unknown };
  if (n.children) return n.children.flatMap(leaves);
  return n.field && n.operator ? [{ field: n.field, operator: n.operator, value: n.value }] : [];
}

describe('segment templates', () => {
  it('should be system templates for both targets with unique names and rule-language conditions', () => {
    expect(new Set(SEGMENT_TEMPLATES.map((t) => t.name)).size).toBe(SEGMENT_TEMPLATES.length);
    expect(new Set(SEGMENT_TEMPLATES.map((t) => t.target))).toEqual(new Set(['profiles', 'identities']));
    for (const t of SEGMENT_TEMPLATES) expect(leaves(t.conditions).length, t.name).toBeGreaterThan(0);
    const names = SEGMENT_TEMPLATES.map((t) => t.name);
    for (const name of ['Frequent visitors', 'Inactive for 30 days', 'Contractors ending soon', 'Unknown frequent faces', 'On shift now']) {
      expect(names).toContain(name);
    }
  });
});

describe('novaSegments', () => {
  const segments = novaSegments(REFS, { now: NOW });
  const byName = new Map<string, SegmentSpec>(segments.map((s) => [s.name, s]));

  it('should plan the demo segments of both targets with unique names', () => {
    expect(new Set(segments.map((s) => s.name)).size).toBe(segments.length);
    for (const name of [SEGMENT_NAMES.nightShift, SEGMENT_NAMES.frequent, SEGMENT_NAMES.vip, SEGMENT_NAMES.contractorsEnding,
      SEGMENT_NAMES.unknownFrequent, SEGMENT_NAMES.executive, SEGMENT_NAMES.parking, SEGMENT_NAMES.fitOut, SEGMENT_NAMES.weekend]) {
      expect(byName.has(name), name).toBe(true);
    }
    expect(byName.get(SEGMENT_NAMES.unknownFrequent)?.target).toBe('identities');
    expect(segments.filter((s) => s.target === 'profiles').length).toBeGreaterThan(5);
  });

  it('should keep kind and conditions consistent (manual = no conditions)', () => {
    for (const s of segments) {
      if (s.kind === 'manual') expect(s.conditions, s.name).toEqual({});
      else expect(leaves(s.conditions).length, s.name).toBeGreaterThan(0);
    }
    expect(byName.get(SEGMENT_NAMES.executive)?.kind).toBe('manual');
  });

  it('should use the seed references and relative dates', () => {
    expect(leaves(byName.get(SEGMENT_NAMES.nightShift)?.conditions)).toContainEqual({ field: 'work_schedule_id', operator: 'eq', value: 'schedule-night' });
    expect(leaves(byName.get(SEGMENT_NAMES.fitOut)?.conditions)).toContainEqual({ field: 'company_id', operator: 'eq', value: 'company-lumen' });
    expect(leaves(byName.get(SEGMENT_NAMES.contractorsEnding)?.conditions)).toContainEqual({
      field: 'end_date',
      operator: 'between',
      value: [{ relative_days: 0 }, { relative_days: 30 }],
    });
  });

  it('should have one inactive segment, one with an active window around now and one with a weekend schedule', () => {
    expect(segments.filter((s) => s.status === 'inactive').map((s) => s.name)).toEqual([SEGMENT_NAMES.parking]);
    const fitOut = byName.get(SEGMENT_NAMES.fitOut);
    expect(fitOut?.activeFrom).toBeLessThan(NOW - 7 * DAY);
    expect(fitOut?.activeFrom).toBeGreaterThan(NOW - 30 * DAY);
    expect(fitOut?.activeUntil).toBeGreaterThan(NOW);
    expect(byName.get(SEGMENT_NAMES.weekend)?.schedule).toEqual([{ days: [6, 7], from: '00:00', to: '24:00' }]);
    expect(segments.filter((s) => s.schedule !== null)).toHaveLength(1);
  });

  it('should name only existing templates', () => {
    const templates = new Map(SEGMENT_TEMPLATES.map((t) => [t.name, t.target]));
    for (const s of segments) if (s.template) expect(templates.get(s.template), s.name).toBe(s.target);
  });

  it('should give Riverside one small dynamic segment', () => {
    const riverside = riversideSegments();
    expect(riverside).toHaveLength(1);
    expect(riverside[0]).toMatchObject({ kind: 'dynamic', target: 'profiles', status: 'active' });
  });
});

describe('segmentHistoryTimes', () => {
  const times = segmentHistoryTimes({ createdAt: CREATED, now: NOW, timezone: TZ });

  it('should evaluate right after creation, at every local day end since and finally at now, ascending', () => {
    expect(times.evaluations[0]).toBe(CREATED + 60_000);
    expect(times.evaluations[times.evaluations.length - 1]).toBe(NOW);
    for (let i = 1; i < times.evaluations.length; i += 1) expect(times.evaluations[i]).toBeGreaterThan(times.evaluations[i - 1]);
    const dayEnds = times.evaluations.slice(1, -1);
    // 23:59:59 local of every date from the creation date to yesterday.
    expect(dayEnds).toHaveLength(33);
    for (const t of dayEnds) expect(localMinutes(t, TZ)).toBe(23 * 60 + 59);
    expect(localDate(dayEnds[0], TZ)).toBe(localDate(CREATED, TZ));
    expect(localDate(dayEnds[dayEnds.length - 1], TZ)).toBe(localDate(NOW - DAY, TZ));
  });

  it('should compute daily stats for every day end and for now', () => {
    expect(times.stats).toEqual(times.evaluations.slice(1));
  });

  it('should evaluate once at now when the segment is created now', () => {
    expect(segmentHistoryTimes({ createdAt: NOW, now: NOW, timezone: TZ })).toEqual({ evaluations: [NOW], stats: [NOW] });
  });
});

describe('manual members', () => {
  it('should back-date the executive floor access holders and close one membership', () => {
    const rows = executiveMembers({ vips: ['v1', 'v2'], securityChief: 'chief', assistants: ['a1', 'a2'], createdAt: CREATED, now: NOW, timezone: TZ });
    expect(rows.map((r) => r.profileId)).toEqual(['v1', 'v2', 'chief', 'a1', 'a2']);
    for (const r of rows) {
      expect(r.addedAt).toBeGreaterThan(CREATED);
      expect(r.addedAt).toBeLessThan(NOW);
      if (r.removedAt !== null) {
        expect(r.removedAt).toBeGreaterThan(r.addedAt);
        expect(r.removedAt).toBeLessThan(NOW);
      }
    }
    expect(rows.filter((r) => r.removedAt !== null).map((r) => r.profileId)).toEqual(['a1']);
  });

  it('should skip missing people', () => {
    const rows = executiveMembers({ vips: [], securityChief: null, assistants: ['a1'], createdAt: CREATED, now: NOW, timezone: TZ });
    expect(rows.map((r) => r.profileId)).toEqual(['a1']);
  });

  it('should pin one visitor to the frequent visitors in the past', () => {
    const pin = frequentVisitorPin('visitor-1', { now: NOW, timezone: TZ });
    expect(pin.profileId).toBe('visitor-1');
    expect(pin.addedAt).toBeLessThan(NOW - 7 * DAY);
    expect(pin.removedAt).toBeNull();
  });
});

describe('segment rules', () => {
  it('should scope the event rule and condition the notification rule to seeded segments', () => {
    const names = new Set(novaSegments(REFS, { now: NOW }).map((s) => s.name));
    expect(names.has(SEGMENT_EVENT_RULE.segment)).toBe(true);
    expect(names.has(SEGMENT_NOTIFICATION_RULE.segment)).toBe(true);
  });
});
