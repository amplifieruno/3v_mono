import { describe, expect, it } from 'vitest';
import { buildSegmentHistoryMutation } from './segmentMutation.js';
import type { SegmentSpec } from './segmentPlan.js';

const T0 = Date.parse('2026-09-16T01:01:00Z');
const T1 = Date.parse('2026-09-16T20:59:59Z');
const iso = (ms: number) => new Date(ms).toISOString();

const spec = (name: string, kind: 'manual' | 'dynamic'): SegmentSpec => ({
  name,
  description: name,
  color: '#123456',
  icon: 'users',
  kind,
  target: 'profiles',
  conditions: kind === 'manual' ? {} : { field: 'profile_type', operator: 'eq', value: 'vip' },
  status: 'active',
  activeFrom: kind === 'dynamic' ? T0 - 1000 : null,
  activeUntil: null,
  schedule: null,
  template: null,
});

function build() {
  return buildSegmentHistoryMutation({
    organization: 'org',
    createdAt: T0 - 60_000,
    addedBy: 'member-1',
    segments: [
      { id: 'seg-b', spec: spec('Dynamic', 'dynamic'), templateId: 'tpl' },
      { id: 'seg-a', spec: spec('Manual', 'manual'), templateId: null },
    ],
    manual: [
      { segmentId: 'seg-a', member: { profileId: 'p1', addedAt: T0, removedAt: null } },
      { segmentId: 'seg-a', member: { profileId: 'p2', addedAt: T0, removedAt: T1 } },
    ],
    // Deliberately unordered: the builder orders by time, then segment.
    syncs: [
      { segmentId: 'seg-b', at: T1, ids: ['p3'] },
      { segmentId: 'seg-c', at: T0, ids: [] },
      { segmentId: 'seg-b', at: T0, ids: ['p3', 'p4'] },
    ],
    statsTimes: [T1],
  });
}

describe('buildSegmentHistoryMutation', () => {
  it('should insert the segments and manual rows first, then sync in time order, then compute daily stats', () => {
    const m = build();
    const order = ['segments: insert_segments', 'manual: insert_segment_members', 's0: sync_segment_members', 's1: sync_segment_members',
      's2: sync_segment_members', 'd0: refresh_segment_daily_stats'];
    const positions = order.map((f) => m.query.indexOf(f));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(m.syncFields).toEqual(['s0', 's1', 's2']);
    expect(m.query).toMatch(/s0: sync_segment_members\(args: \{ p_segment: "seg-b", p_ids: \$ids0, p_at: "2026-09-16T01:01:00.000Z" \}\)/);
    expect(m.query).toMatch(/s1: sync_segment_members\(args: \{ p_segment: "seg-c"/);
    expect(m.query).toMatch(/s2: sync_segment_members\(args: \{ p_segment: "seg-b", p_ids: \$ids2, p_at: "2026-09-16T20:59:59.000Z" \}\)/);
    expect(m.variables).toMatchObject({ ids0: '{p3,p4}', ids1: '{}', ids2: '{p3}' });
  });

  it('should write the segment rows dated at creation with their window and template', () => {
    const { variables } = build();
    const segments = variables.segments as Record<string, unknown>[];
    expect(segments[0]).toMatchObject({
      id: 'seg-b',
      organization_id: 'org',
      kind: 'dynamic',
      status: 'active',
      template_id: 'tpl',
      active_from: iso(T0 - 1000),
      active_until: null,
      schedule: null,
      created_at: iso(T0 - 60_000),
    });
    expect(segments[1]).toMatchObject({ id: 'seg-a', kind: 'manual', conditions: {} });
  });

  it('should back-date the manual rows with the admin as actor (also of the removal)', () => {
    const manual = build().variables.manual as Record<string, unknown>[];
    expect(manual).toEqual([
      { organization_id: 'org', segment_id: 'seg-a', target: 'profiles', profile_id: 'p1', source: 'manual', added_by: 'member-1', added_at: iso(T0), removed_at: null, removed_by: null, created_at: iso(T0) },
      { organization_id: 'org', segment_id: 'seg-a', target: 'profiles', profile_id: 'p2', source: 'manual', added_by: 'member-1', added_at: iso(T0), removed_at: iso(T1), removed_by: 'member-1', created_at: iso(T0) },
    ]);
  });

  it('should leave out empty parts', () => {
    const m = buildSegmentHistoryMutation({ organization: 'org', createdAt: T0, addedBy: 'm', segments: [], manual: [], syncs: [], statsTimes: [] });
    expect(m.query).not.toContain('insert_segments');
    expect(m.query).not.toContain('insert_segment_members');
    expect(m.syncFields).toEqual([]);
  });
});
