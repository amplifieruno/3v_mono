import { createI18nFromRegistry } from '@burojs/i18n-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLocaleRegistry } from '../../src/i18n/registry';
import { checkSegmentConditions, conditionIssue } from '../../src/fields/segment-conditions';
import { type Translate, conditionsSentence } from '../../src/fields/segment-conditions-format';
import { catalogOf, convertValue, newLeaf, withField, withOperator } from '../../src/fields/segment-conditions-operators';
import { conditionPathIn, describeConditionPath, jsonPathOf, ownerOf, targetOfPath } from '../../src/fields/segment-conditions-path';
import { publishConditions } from '../../src/fields/segment-conditions-registry';
import { addChild, canAdd, moveAt, removeAt, replaceAt, setGroupOp } from '../../src/fields/segment-conditions-tree';
import { validateSegmentConditions } from '../../src/fields/segment-conditions-validate';
import { expectTranslated, validatorResult } from '../support/field-issues';
import { ACME, AUTO, FACES, LOBBY, NIGHT, PROFILE_FIELDS, REFS, SELF, VIPS, id } from '../support/segment-conditions-fixture';

/**
 * Segment conditions (`itap.segment-conditions`): the grammar of `itap.validate_segment_node`
 * mirrored on the client with the database's JSON paths, the tree edits, the operator and field
 * changes, the server path mapping (Review Focus 2) and the sentence.
 */

const catalog = catalogOf(PROFILE_FIELDS);
const ctx = { catalog, refs: REFS, target: 'profiles', self: SELF };
const leaf = (f: string, operator: string, value: unknown) => ({ field: f, operator, value });
const and = (...children: unknown[]) => ({ op: 'and', children });
const paths = (value: unknown) => validateSegmentConditions(value, ctx).map((problem) => [problem.path, problem.code]);

let t: Translate;
beforeAll(async () => {
  const i18n = await createI18nFromRegistry(buildLocaleRegistry(), { defaultLocale: 'en', warnOnMissing: false });
  t = (key, options) => i18n.t(key, options);
});

describe('the grammar (itap.validate_segment_node)', () => {
  it('should accept what the database accepts', () => {
    for (const ok of [
      {},
      null,
      leaf('visits_last_30d', 'gte', 8),
      and(leaf('profile_type', 'eq', 'contractor'), leaf('end_date', 'between', [{ relative_days: 0 }, { relative_days: 30 }])),
      { op: 'or', children: [leaf('department', 'is_null', true), leaf('company_id', 'in', [ACME.toUpperCase()])] },
      { op: 'not', children: [leaf('member_of_segment', 'eq', VIPS)] },
      leaf('end_date', 'gte', '2026-12-31'),
      leaf('first_seen_at', 'between', ['2026-01-01T00:00:00Z', { relative_days: -1 }]),
      leaf('avg_dwell_minutes', 'lt', 12.5),
      leaf('custom_fields.shift', 'nin', ['night']),
      leaf('on_shift_now', 'eq', false),
      leaf('top_area_id', 'eq', LOBBY),
      leaf('work_schedule_id', 'neq', NIGHT),
    ]) {
      expect(validateSegmentConditions(ok, ctx), JSON.stringify(ok)).toEqual([]);
    }
  });

  it('should refuse each node on the path the database names', () => {
    expect(paths([])).toEqual([['$', 'segmentConditions.notNode']]);
    expect(paths({ op: 'and', children: [], extra: 1 })).toEqual([['$', 'segmentConditions.groupKeys']]);
    expect(paths({ op: 'xor', children: [leaf('on_shift_now', 'eq', true)] })).toEqual([['$.op', 'segmentConditions.groupOp']]);
    expect(paths(and())).toEqual([['$.children', 'segmentConditions.noChildren']]);
    expect(paths({ op: 'not', children: [leaf('on_shift_now', 'eq', true), leaf('on_shift_now', 'eq', false)] })).toEqual([
      ['$.children', 'segmentConditions.notOne'],
    ]);
    expect(paths(and(...Array.from({ length: 101 }, () => leaf('on_shift_now', 'eq', true))))[0]).toEqual([
      '$.children',
      'segmentConditions.tooManyChildren',
    ]);
    expect(paths(and(leaf('on_shift_now', 'eq', true), { field: 'x', operator: 'eq' }))).toEqual([['$.children[1]', 'segmentConditions.leafKeys']]);
    expect(paths(and(leaf('on_shift_now', 'eq', true), 'text'))).toEqual([['$.children[1]', 'segmentConditions.notNode']]);
    expect(paths(leaf('profile_type', 'contains', 'vip'))).toEqual([['$.operator', 'segmentConditions.badOperator']]);
    // Seven levels deep is the most: the eighth level is refused on its node.
    let deep: unknown = leaf('on_shift_now', 'eq', true);
    for (let level = 0; level < 7; level += 1) deep = and(deep);
    expect(paths(deep)).toEqual([['$.children[0].children[0].children[0].children[0].children[0].children[0].children[0]', 'segmentConditions.tooDeep']]);
  });

  it('should keep a field the catalog no longer offers and refuse it on its node (Review Focus 1)', () => {
    expect(paths(and(leaf('status', 'eq', 'active'), leaf('custom_fields.badge_number', 'eq', 'B-1')))).toEqual([
      ['$.children[1].field', 'segmentConditions.unknownField'],
    ]);
    // Without the catalog only the grammar is checked: nothing is refused for the field.
    expect(validateSegmentConditions(leaf('custom_fields.badge_number', 'eq', 'B-1'))).toEqual([]);
  });

  it('should check values by type and operator, list entries on their index', () => {
    const refused: readonly [unknown, string, string][] = [
      [leaf('department', 'is_null', 'yes'), '$.value', 'flag'],
      [leaf('company_id', 'in', []), '$.value', 'listEmpty'],
      [leaf('visits_last_30d', 'in', Array.from({ length: 501 }, (_, i) => i)), '$.value', 'listTooLong'],
      [leaf('visits_last_30d', 'in', [1, 2.5]), '$.value[1]', 'integer'],
      [leaf('visits_last_30d', 'eq', 2147483648), '$.value', 'integer'],
      [leaf('avg_dwell_minutes', 'eq', 1e15), '$.value', 'number'],
      [leaf('first_name', 'eq', '  '), '$.value', 'text'],
      [leaf('profile_type', 'eq', 'boss'), '$.value', 'enum'],
      [leaf('on_shift_now', 'eq', 'true'), '$.value', 'boolean'],
      [leaf('end_date', 'eq', '2026-02-30'), '$.value', 'date'],
      [leaf('end_date', 'eq', { relative_days: 36501 }), '$.value', 'date'],
      [leaf('end_date', 'eq', { relative_days: 1.5 }), '$.value', 'date'],
      [leaf('end_date', 'eq', { relative_days: 1, extra: 1 }), '$.value', 'date'],
      [leaf('first_seen_at', 'gt', 'yesterday'), '$.value', 'timestamp'],
      [leaf('company_id', 'eq', 'acme'), '$.value', 'reference'],
      [leaf('visits_last_30d', 'between', [5]), '$.value', 'pair'],
      [leaf('visits_last_30d', 'between', [5, null]), '$.value', 'pair'],
      [leaf('visits_last_30d', 'between', [9, 5]), '$.value', 'reversed'],
      [leaf('end_date', 'between', [{ relative_days: 30 }, { relative_days: 0 }]), '$.value', 'reversed'],
      [leaf('end_date', 'between', ['2026-12-31', '2026-01-01']), '$.value', 'reversed'],
    ];
    for (const [value, path, code] of refused) {
      expect(paths(value), JSON.stringify(value)).toEqual([[path, `segmentConditions.${code}`]]);
    }
  });

  it('should check references against the organization: manual segments of the target, never itself', () => {
    expect(paths(leaf('company_id', 'eq', id(99)))).toEqual([['$.value', 'segmentConditions.gone']]);
    expect(paths(leaf('member_of_segment', 'eq', AUTO))).toEqual([['$.value', 'segmentConditions.segmentNotManual']]);
    expect(paths(leaf('member_of_segment', 'in', [VIPS, FACES]))).toEqual([['$.value[1]', 'segmentConditions.segmentNotManual']]);
    expect(paths(leaf('member_of_segment', 'eq', SELF))).toEqual([['$.value', 'segmentConditions.segmentSelf']]);
    // Without the records the shape alone is checked.
    expect(validateSegmentConditions(leaf('company_id', 'eq', id(99)), { catalog })).toEqual([]);
  });

  it('should report every refused node, not only the first', () => {
    expect(paths(and(leaf('profile_type', 'eq', 'boss'), leaf('nope', 'eq', 1), leaf('visits_last_30d', 'gte', 'x')))).toEqual([
      ['$.children[0].value', 'segmentConditions.enum'],
      ['$.children[1].field', 'segmentConditions.unknownField'],
      ['$.children[2].value', 'segmentConditions.integer'],
    ]);
  });

  it('should answer translatable issues on the JSON path, using the mounted editor’s catalog', async () => {
    const validate = checkSegmentConditions('target');
    const value = and(leaf('status', 'eq', 'active'), leaf('custom_fields.badge_number', 'eq', 'B-1'));
    // Without a mounted editor: the grammar only.
    expect(await validatorResult(validate, value)).toBeNull();
    const withdraw = publishConditions(ctx);
    try {
      const result = (await validatorResult(validate, value)) as { path: unknown[] }[];
      expect(result.map((issue) => issue.path)).toEqual([['$.children[1].field']]);
      expect(await validatorResult(validate, {})).toBeNull();
    } finally {
      withdraw();
    }
    expect(await validatorResult(validate, value)).toBeNull();
    const samples = [[], and(), leaf('nope', 'eq', 1), leaf('profile_type', 'contains', 'x'), leaf('member_of_segment', 'eq', AUTO)];
    for (const sample of samples) {
      for (const problem of validateSegmentConditions(sample, ctx)) {
        await expectTranslated(problem);
        expect(conditionIssue(problem).path).toEqual([problem.path]);
      }
    }
  });
});

describe('server paths (Review Focus 2)', () => {
  it('should map a refusal path to its node', () => {
    expect(targetOfPath('$')).toEqual({ node: [], part: 'node' });
    expect(targetOfPath('$.children[2].value')).toEqual({ node: [2], part: 'value' });
    expect(targetOfPath('$.children[0].children[1].value[3]')).toEqual({ node: [0, 1], part: 'value', valueIndex: 3 });
    expect(targetOfPath('$.children[1].children')).toEqual({ node: [1], part: 'children' });
    expect(targetOfPath('$.children[1].op')).toEqual({ node: [1], part: 'op' });
    expect(targetOfPath('$.bogus')).toBeNull();
    expect(ownerOf('$.children[2].value')).toBe('$.children[2]');
    expect(jsonPathOf([0, 3])).toBe('$.children[0].children[3]');
  });

  it('should read the path out of the database’s message and name the condition', () => {
    expect(conditionPathIn('Check constraint violation. segment_condition_invalid:$.children[2].value')).toBe('$.children[2].value');
    expect(conditionPathIn('Check constraint violation. segment_referenced')).toBeNull();
    const conditions = and(leaf('status', 'eq', 'active'), leaf('profile_type', 'eq', 'vip'), leaf('end_date', 'gte', 'x'));
    expect(describeConditionPath(conditions, '$.children[2].value')).toBe('the value of the condition on “end_date” (3)');
    expect(describeConditionPath(conditions, '$.children')).toBe('the group at the top');
    expect(describeConditionPath(conditions, '$.children[9].value')).toBe('$.children[9].value');
  });
});

describe('tree edits', () => {
  const a = leaf('status', 'eq', 'active');
  const b = leaf('on_shift_now', 'eq', true);
  const c = leaf('visits_last_30d', 'gte', 2);

  it('should add, move, replace and remove nodes', () => {
    expect(addChild({}, [], a)).toEqual(a);
    expect(addChild(a, [], b)).toEqual(and(a, b));
    expect(addChild(and(a, and(b)), [1], c)).toEqual(and(a, and(b, c)));
    expect(moveAt(and(a, b, c), [2], -1)).toEqual(and(a, c, b));
    expect(moveAt(and(a, b), [0], -1)).toEqual(and(a, b));
    expect(replaceAt(and(a, and(b)), [1, 0], c)).toEqual(and(a, and(c)));
    expect(removeAt(and(a, b), [0])).toEqual(and(b));
    expect(removeAt(a, [])).toEqual({});
    expect(removeAt(and(a), [0])).toEqual({});
    expect(removeAt(and(a, and(b)), [1, 0])).toEqual(and(a, and()));
  });

  it('should keep "not" to one condition and stop at the limits', () => {
    expect(setGroupOp(and(a, b), [], 'or')).toEqual({ op: 'or', children: [a, b] });
    expect(setGroupOp({ op: 'or', children: [a, b] }, [], 'not')).toEqual({ op: 'not', children: [{ op: 'or', children: [a, b] }] });
    expect(setGroupOp(and(a), [], 'not')).toEqual({ op: 'not', children: [a] });
    expect(canAdd({ op: 'not', children: [a] }, [])).toEqual({ leaf: false, group: false });
    expect(canAdd(and(a), [0, 0, 0, 0, 0])).toEqual({ leaf: true, group: false });
    expect(canAdd(and(a), [0, 0, 0, 0, 0, 0])).toEqual({ leaf: false, group: false });
    expect(canAdd(and(...Array.from({ length: 100 }, () => a)), [])).toEqual({ leaf: false, group: false });
  });

  it('should carry values across operator and field changes', () => {
    const visits = catalog.get('visits_last_30d');
    const status = catalog.get('status');
    const type = catalog.get('profile_type');
    if (visits === undefined || status === undefined || type === undefined) throw new Error('catalog');
    expect(convertValue(visits, 5, 'gte', 'in')).toEqual([5]);
    expect(convertValue(visits, [5, 6], 'in', 'eq')).toBe(5);
    expect(convertValue(visits, 5, 'gte', 'between')).toEqual([5, null]);
    expect(convertValue(visits, 5, 'gte', 'is_null')).toBe(true);
    expect(convertValue(visits, true, 'is_null', 'eq')).toBeNull();
    expect(withOperator(leaf('visits_last_30d', 'gte', 5), visits, 'lt')).toEqual(leaf('visits_last_30d', 'lt', 5));
    // Another enum: its own values, so the value starts over; the operator is kept when offered.
    expect(withField(leaf('status', 'neq', 'active'), status, type)).toEqual(leaf('profile_type', 'neq', 'contractor'));
    expect(withField(leaf('visits_last_30d', 'between', [1, 2]), visits, type)).toEqual(leaf('profile_type', 'eq', 'contractor'));
    expect(newLeaf(catalog)).toEqual(leaf('first_name', 'eq', ''));
  });
});

describe('the sentence', () => {
  it('should read the conditions with labels, names and relative dates', () => {
    const value = and(
      leaf('profile_type', 'eq', 'contractor'),
      leaf('end_date', 'between', [{ relative_days: 0 }, { relative_days: 30 }]),
      { op: 'or', children: [leaf('company_id', 'in', [ACME]), leaf('department', 'is_null', false)] },
      { op: 'not', children: [leaf('member_of_segment', 'eq', VIPS)] },
      leaf('on_shift_now', 'eq', true),
      leaf('visits_last_30d', 'gte', 3),
      leaf('first_seen_at', 'gte', { relative_days: -7 }),
    );
    expect(conditionsSentence(value, { catalog, refs: REFS, t })).toBe(
      'Profile type is contractor and End date is between today and in 30 days and (Company is one of Acme or Department is not empty) and not (Member of segment is VIP guests) and On shift now (work schedule): yes and Visits (30 days) is at least 3 and First seen is on or after 7 days ago',
    );
    expect(conditionsSentence({}, { t })).toBe('No conditions.');
  });

  it('should name a field the catalog no longer offers and an unknown record, not drop them', () => {
    const value = and(leaf('custom_fields.badge_number', 'eq', 'B-1'), leaf('top_area_id', 'eq', id(99)), 'odd');
    expect(conditionsSentence(value, { catalog, refs: REFS, t })).toBe(
      `“custom_fields.badge_number” (no longer offered) is “B-1” and Most visited area (30 days) is unknown record (${id(99)}) and An unreadable condition`,
    );
    expect(conditionsSentence(leaf('top_area_id', 'eq', LOBBY), { catalog, refs: REFS, t })).toBe('Most visited area (30 days) is Lobby (Nova Tower)');
  });
});
