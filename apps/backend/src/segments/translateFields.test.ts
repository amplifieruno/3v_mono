import { describe, expect, it } from 'vitest';
import { context, identityCatalog, profileCatalog } from './catalog.fixture.js';
import { translateConditions } from './translate.js';

const profile = (field: string, operator: string, value: unknown) =>
  translateConditions('profiles', { field, operator, value }, profileCatalog, context);
const identity = (field: string, operator: string, value: unknown) =>
  translateConditions('identities', { field, operator, value }, identityCatalog, context);
const ago = (days: number) => new Date(Date.parse(context.at) - days * 86_400_000).toISOString();

describe('behavioral metrics (activity stats relationship; no stats row = every comparison false)', () => {
  it('should compare metric columns inside the relationship', () => {
    expect(profile('visits_last_30d', 'gte', 5)).toEqual({
      profile_activity_stats: { visits_last_30d: { _is_null: false, _gte: 5 } },
    });
    expect(identity('avg_dwell_minutes', 'between', [10, 20.5])).toEqual({
      identity_activity_stats: { avg_dwell_minutes: { _is_null: false, _gte: 10, _lte: 20.5 } },
    });
    expect(identity('after_hours_visits_30d', 'nin', [0])).toEqual({
      identity_activity_stats: { after_hours_visits_30d: { _is_null: false, _nin: [0] } },
    });
    expect(profile('visited_area_id', 'in', ['a1', 'a2'])).toEqual({ profile_activity_stats: { top_area_id: { _in: ['a1', 'a2'] } } });
    expect(profile('visited_area_id', 'neq', 'a1')).toEqual({ profile_activity_stats: { top_area_id: { _neq: 'a1' } } });
  });

  it('should treat a missing stats row as null for is_null', () => {
    expect(profile('avg_dwell_minutes', 'is_null', true)).toEqual({
      _or: [{ _not: { profile_activity_stats: {} } }, { profile_activity_stats: { avg_dwell_minutes: { _is_null: true } } }],
    });
    expect(profile('avg_dwell_minutes', 'is_null', false)).toEqual({
      profile_activity_stats: { avg_dwell_minutes: { _is_null: false } },
    });
  });

  it('should turn last_seen_days_ago (whole days before the evaluation time) into last_seen_at bounds', () => {
    const rel = (cmp: unknown) => ({ identity_activity_stats: cmp });
    expect(identity('last_seen_days_ago', 'eq', 3)).toEqual(rel({ last_seen_at: { _gt: ago(4), _lte: ago(3) } }));
    expect(identity('last_seen_days_ago', 'gt', 3)).toEqual(rel({ last_seen_at: { _lte: ago(4) } }));
    expect(identity('last_seen_days_ago', 'gte', 3)).toEqual(rel({ last_seen_at: { _lte: ago(3) } }));
    expect(identity('last_seen_days_ago', 'lt', 3)).toEqual(rel({ last_seen_at: { _gt: ago(3) } }));
    expect(identity('last_seen_days_ago', 'lte', 3)).toEqual(rel({ last_seen_at: { _gt: ago(4) } }));
    expect(identity('last_seen_days_ago', 'between', [1, 2])).toEqual(rel({ last_seen_at: { _lte: ago(1), _gt: ago(3) } }));
    expect(identity('last_seen_days_ago', 'neq', 3)).toEqual(
      rel({ _or: [{ last_seen_at: { _gt: ago(3) } }, { last_seen_at: { _lte: ago(4) } }] }),
    );
    expect(identity('last_seen_days_ago', 'in', [0, 7])).toEqual(
      rel({ _or: [{ last_seen_at: { _gt: ago(1), _lte: ago(0) } }, { last_seen_at: { _gt: ago(8), _lte: ago(7) } }] }),
    );
    expect(identity('last_seen_days_ago', 'nin', [0])).toEqual(
      rel({ _and: [{ _or: [{ last_seen_at: { _gt: ago(0) } }, { last_seen_at: { _lte: ago(1) } }] }] }),
    );
    expect(identity('last_seen_days_ago', 'is_null', true)).toEqual({
      _or: [{ _not: { identity_activity_stats: {} } }, { identity_activity_stats: { last_seen_at: { _is_null: true } } }],
    });
  });
});

describe('jsonb path fields', () => {
  const present = { _and: [{ custom_fields: { _has_key: 'badge' } }, { _not: { custom_fields: { _contains: { badge: null } } } }] };
  it('should use containment for eq / in and presence for neq / nin / is_null', () => {
    expect(profile('custom_fields.badge', 'eq', 'B7')).toEqual({ custom_fields: { _contains: { badge: 'B7' } } });
    expect(profile('custom_fields.badge', 'in', ['B7', 'B8'])).toEqual({
      _or: [{ custom_fields: { _contains: { badge: 'B7' } } }, { custom_fields: { _contains: { badge: 'B8' } } }],
    });
    expect(profile('custom_fields.badge', 'neq', 'B7')).toEqual({
      _and: [present, { _not: { custom_fields: { _contains: { badge: 'B7' } } } }],
    });
    expect(profile('custom_fields.badge', 'nin', ['B7'])).toEqual({
      _and: [present, { _not: { custom_fields: { _contains: { badge: 'B7' } } } }],
    });
    expect(profile('custom_fields.badge', 'is_null', false)).toEqual(present);
    expect(profile('custom_fields.badge', 'is_null', true)).toEqual({ _not: present });
    expect(profile('custom_fields.vip', 'eq', true)).toEqual({ custom_fields: { _contains: { vip: true } } });
    expect(identity('attributes.gender', 'eq', 'female')).toEqual({ attributes: { _contains: { gender: 'female' } } });
  });
});

describe('derived profile and identity fields', () => {
  it('should resolve on_shift_now through the schedules on shift at the evaluation time', () => {
    const ids = context.onShiftScheduleIds;
    expect(profile('on_shift_now', 'eq', true)).toEqual({ work_schedule_id: { _in: ids } });
    expect(profile('on_shift_now', 'eq', false)).toEqual({
      _or: [{ work_schedule_id: { _is_null: true } }, { work_schedule_id: { _nin: ids } }],
    });
  });

  it('should match visit_status_today against visits (as visitor) expected on the organization-local day', () => {
    const today = { expected_start: { _gte: context.dayStart, _lt: context.dayEnd } };
    const rel = (cmp: unknown) => ({ visits_by_visitor_profile: cmp });
    expect(profile('visit_status_today', 'eq', 'checked_in')).toEqual(rel({ ...today, status: { _eq: 'checked_in' } }));
    expect(profile('visit_status_today', 'in', ['scheduled'])).toEqual(rel({ ...today, status: { _in: ['scheduled'] } }));
    expect(profile('visit_status_today', 'neq', 'scheduled')).toEqual({
      _and: [rel(today), { _not: rel({ ...today, status: { _eq: 'scheduled' } }) }],
    });
    expect(profile('visit_status_today', 'nin', ['scheduled'])).toEqual({
      _and: [rel(today), { _not: rel({ ...today, status: { _in: ['scheduled'] } }) }],
    });
    expect(profile('visit_status_today', 'is_null', true)).toEqual({ _not: rel(today) });
    expect(profile('visit_status_today', 'is_null', false)).toEqual(rel(today));
  });

  it('should match member_of_segment against open membership rows', () => {
    const open = { removed_at: { _is_null: true } };
    expect(profile('member_of_segment', 'eq', 's1')).toEqual({ segment_members: { segment_id: { _eq: 's1' }, ...open } });
    expect(identity('member_of_segment', 'in', ['s1', 's2'])).toEqual({ segment_members: { segment_id: { _in: ['s1', 's2'] }, ...open } });
    expect(profile('member_of_segment', 'neq', 's1')).toEqual({ _not: { segment_members: { segment_id: { _eq: 's1' }, ...open } } });
    expect(identity('member_of_segment', 'nin', ['s1'])).toEqual({ _not: { segment_members: { segment_id: { _in: ['s1'] }, ...open } } });
  });

  it('should map linked onto profile_id', () => {
    expect(identity('linked', 'eq', true)).toEqual({ profile_id: { _is_null: false } });
    expect(identity('linked', 'eq', false)).toEqual({ profile_id: { _is_null: true } });
  });
});
