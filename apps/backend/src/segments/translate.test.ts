import { describe, expect, it } from 'vitest';
import { context, identityCatalog, profileCatalog } from './catalog.fixture.js';
import { segmentWhere, translateConditions } from './translate.js';
import { SegmentTranslateError } from './types.js';

const profile = (node: unknown) => translateConditions('profiles', node, profileCatalog, context);
const identity = (node: unknown) => translateConditions('identities', node, identityCatalog, context);
const leaf = (field: string, operator: string, value: unknown) => ({ field, operator, value });

describe('translateConditions: groups', () => {
  it('should map and / or / not onto _and / _or / _not', () => {
    const tree = {
      op: 'and',
      children: [
        leaf('first_name', 'eq', 'Ann'),
        { op: 'or', children: [leaf('status', 'eq', 'active'), { op: 'not', children: [leaf('has_face', 'eq', true)] }] },
      ],
    };
    expect(profile(tree)).toEqual({
      _and: [
        { first_name: { _eq: 'Ann' } },
        { _or: [{ status: { _eq: 'active' } }, { _not: { has_face: { _eq: true } } }] },
      ],
    });
  });

  it('should reject malformed trees, unknown fields and operators with the JSON path', () => {
    const cases: [unknown, string][] = [
      [null, '$'],
      [{ op: 'xor', children: [] }, '$.op'],
      [{ op: 'not', children: [leaf('first_name', 'eq', 'a'), leaf('first_name', 'eq', 'b')] }, '$.children'],
      [{ op: 'and', children: [leaf('nope', 'eq', 1)] }, '$.children[0].field'],
      [leaf('first_name', 'gt', 'a'), '$.operator'],
      [leaf('first_name', 'in', 'a'), '$.value'],
      [leaf('email', 'is_null', 'yes'), '$.value'],
      [leaf('visits_last_30d', 'between', [1]), '$.value'],
    ];
    for (const [node, path] of cases) {
      let caught: unknown;
      try {
        profile(node);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SegmentTranslateError);
      expect((caught as SegmentTranslateError).path).toBe(path);
    }
  });
});

describe('translateConditions: columns', () => {
  it('should translate every comparison operator', () => {
    expect(profile(leaf('first_name', 'neq', 'Ann'))).toEqual({ first_name: { _neq: 'Ann' } });
    expect(profile(leaf('first_name', 'in', ['A', 'B']))).toEqual({ first_name: { _in: ['A', 'B'] } });
    expect(profile(leaf('first_name', 'nin', ['A']))).toEqual({ first_name: { _nin: ['A'] } });
    expect(identity(leaf('detection_count', 'gt', 5))).toEqual({ detection_count: { _gt: 5 } });
    expect(identity(leaf('detection_count', 'gte', 5))).toEqual({ detection_count: { _gte: 5 } });
    expect(identity(leaf('detection_count', 'lt', 5))).toEqual({ detection_count: { _lt: 5 } });
    expect(identity(leaf('detection_count', 'lte', 5))).toEqual({ detection_count: { _lte: 5 } });
    expect(identity(leaf('detection_count', 'between', [2, 9]))).toEqual({ detection_count: { _gte: 2, _lte: 9 } });
  });

  it('should make comparisons on nullable columns false for nulls (so not() is a plain negation)', () => {
    expect(profile(leaf('email', 'eq', 'a@b.c'))).toEqual({ email: { _is_null: false, _eq: 'a@b.c' } });
    expect(identity(leaf('age', 'between', [20, 30]))).toEqual({ age: { _is_null: false, _gte: 20, _lte: 30 } });
    expect(profile(leaf('email', 'is_null', true))).toEqual({ email: { _is_null: true } });
    expect(profile(leaf('company_id', 'is_null', false))).toEqual({ company_id: { _is_null: false } });
  });

  it('should translate contains to a case-insensitive pattern with LIKE metacharacters escaped', () => {
    expect(profile(leaf('first_name', 'contains', 'an'))).toEqual({ first_name: { _ilike: '%an%' } });
    expect(profile(leaf('department', 'contains', '50%_a\\b'))).toEqual({
      department: { _is_null: false, _ilike: '%50\\%\\_a\\\\b%' },
    });
  });

  it('should resolve relative_days against the evaluation day (dates) and time (timestamps)', () => {
    expect(profile(leaf('end_date', 'lte', { relative_days: 30 }))).toEqual({ end_date: { _is_null: false, _lte: '2026-11-18' } });
    expect(profile(leaf('end_date', 'between', [{ relative_days: -1 }, '2026-12-31']))).toEqual({
      end_date: { _is_null: false, _gte: '2026-10-18', _lte: '2026-12-31' },
    });
    expect(identity(leaf('first_seen_at', 'gte', { relative_days: -7 }))).toEqual({
      first_seen_at: { _is_null: false, _gte: '2026-10-12T12:00:00.000Z' },
    });
    expect(identity(leaf('first_seen_at', 'lt', '2026-01-01T00:00:00Z'))).toEqual({
      first_seen_at: { _is_null: false, _lt: '2026-01-01T00:00:00Z' },
    });
  });

  it('should pass enum and reference columns through', () => {
    expect(profile(leaf('profile_type', 'in', ['visitor', 'contractor']))).toEqual({ profile_type: { _in: ['visitor', 'contractor'] } });
    expect(profile(leaf('company_id', 'eq', 'c1'))).toEqual({ company_id: { _is_null: false, _eq: 'c1' } });
    expect(profile(leaf('is_blacklisted', 'eq', false))).toEqual({ is_blacklisted: { _eq: false } });
  });
});

describe('segmentWhere', () => {
  it('should scope to the organization and exclude merged and synthetic identities', () => {
    const tree = leaf('detection_count', 'gt', 1);
    expect(segmentWhere('identities', tree, identityCatalog, context, 'org-1')).toEqual({
      _and: [
        { organization_id: { _eq: 'org-1' } },
        { status: { _neq: 'merged' } },
        { is_synthetic: { _eq: false } },
        { detection_count: { _gt: 1 } },
      ],
    });
    expect(segmentWhere('profiles', leaf('first_name', 'eq', 'A'), profileCatalog, context, 'org-1')).toEqual({
      _and: [{ organization_id: { _eq: 'org-1' } }, { first_name: { _eq: 'A' } }],
    });
  });
});
