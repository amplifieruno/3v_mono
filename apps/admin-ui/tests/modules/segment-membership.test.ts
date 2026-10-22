import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import {
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  SEGMENT_IDENTITY_MEMBER_RESOURCE,
  SEGMENT_PROFILE_MEMBER_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { evaluateNowFlow } from '../../src/modules/segments/segment-flows';
import { addApplied, evaluationApplied, removeApplied } from '../../src/modules/segments/segment-membership-checks';
import { addToSegmentFlow } from '../../src/modules/segments/segment-membership-flows';
import { previewRefusal, previewSnapshot, sameSnapshot, unnamedMatches } from '../../src/modules/segments/segment-preview-format';

/**
 * Segment membership without the UI: "Evaluate now" on an active dynamic segment opens what the
 * server answered; "Add members" sends the chosen people or faces of the segment's target;
 * "Add to segment" on a profile or an identity sends that record; "Remove from segment" ends only
 * a current manual membership; lost answers are checked on the data; the refusals of the
 * functions and the actions read as sentences (the evaluation names the refused condition); the
 * preview asks only for something to preview and names a refused condition.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const SEGMENT = '22222222-2222-4222-8222-000000000001';
const PERSON = '44444444-4444-4444-8444-000000000001';
const OTHER = '44444444-4444-4444-8444-000000000002';
const FACE = '66666666-6666-4666-8666-000000000001';
const MEMBERSHIP = '88888888-8888-4888-8888-000000000001';

const CONDITIONS = { op: 'and', children: [{ field: 'visits_last_30d', operator: 'gte', value: 8 }, { field: 'end_date', operator: 'lt', value: '2026-01-01' }] };
const dynamic = {
  id: SEGMENT,
  kind: 'dynamic',
  target: 'profiles',
  status: 'active',
  conditions: CONDITIONS,
  last_evaluated_at: '2026-10-22T10:00:00Z',
};
const manual = { ...dynamic, kind: 'manual', conditions: {} };
const evaluation = { segment_id: SEGMENT, added: 3, removed: 1, member_count: 42, evaluated_at: '2026-10-22T10:05:00Z', stale: false };
const membership = { id: MEMBERSHIP, segment_id: SEGMENT, profile_id: PERSON, source: 'manual', added_at: '2026-10-01T08:00:00Z', removed_at: null };

const flowOn = (resource: string, action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource, action } as const, { user: ADMIN, record, rows: { [resource]: [record] }, mutations: mutations as never });

/** A read-only data access answering `one` with `row` and `list` with `rows`. */
const reading = (row: Record<string, unknown> | null, rows: readonly unknown[] = []) =>
  ({
    one: async () => ({ data: row }),
    list: async () => ({ data: rows }),
  }) as never;
const checkContext = (record: Record<string, unknown>, data: never) =>
  ({ record, args: {}, key: 'k', signal: new AbortController().signal, data }) as never;

beforeAll(async () => {
  await app.ready;
});

describe('evaluate now', () => {
  it('should evaluate an active dynamic segment and open the answer', async () => {
    const flow = await flowOn(SEGMENT_RESOURCE, 'evaluate_now', dynamic, { 'itap:evaluate-segment': [answer(evaluation)] }).open();
    // The review says what happens; the run starts on its confirmation.
    await flow.submit();
    flow.assertNotSubmitted();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { segmentId: SEGMENT, conditions: CONDITIONS } });
    expect(JSON.stringify(flow.state.effects?.open)).toContain('"memberCount":42');
  });

  it('should be offered on active dynamic segments only', async () => {
    for (const record of [manual, { ...dynamic, status: 'inactive' }, { ...dynamic, status: 'archived' }]) {
      (await flowOn(SEGMENT_RESOURCE, 'evaluate_now', record).open()).assertUnavailable();
    }
  });

  it('should check a lost answer on the segment’s last evaluation time', async () => {
    (evaluateNowFlow.submit.input as (ctx: unknown) => unknown)({ record: dynamic, values: {} });
    const later = await evaluationApplied(checkContext(dynamic, reading({ last_evaluated_at: '2026-10-22T10:05:00Z' })));
    const same = await evaluationApplied(checkContext(dynamic, reading({ last_evaluated_at: dynamic.last_evaluated_at })));
    expect([later, same]).toEqual(['applied', 'not-applied']);
    expect(await evaluationApplied(checkContext({ id: OTHER }, reading(null)))).toBe('unknown');
  });
});

describe('add members', () => {
  it('should send the chosen people of a profile segment', async () => {
    const flow = await flowOn(SEGMENT_RESOURCE, 'add_profiles', manual, { 'itap:add-segment-members': [answer({ count: 2 })] }).open();
    flow.fill({ subject_ids: [PERSON, OTHER] });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { segmentId: SEGMENT, subjectIds: [PERSON, OTHER] } });
  });

  it('should offer each target its own flow, also on a dynamic segment, never on an archived one', async () => {
    expect((await flowOn(SEGMENT_RESOURCE, 'add_profiles', dynamic).open()).state.control).toBe('ready');
    (await flowOn(SEGMENT_RESOURCE, 'add_identities', manual).open()).assertUnavailable();
    expect((await flowOn(SEGMENT_RESOURCE, 'add_identities', { ...manual, target: 'identities' }).open()).state.control).toBe('ready');
    (await flowOn(SEGMENT_RESOURCE, 'add_profiles', { ...manual, status: 'archived' }).open()).assertUnavailable();
  });

  it('should check a lost answer by whether the first one sent is a manual member now', async () => {
    const flow = await flowOn(SEGMENT_RESOURCE, 'add_profiles', manual, { 'itap:add-segment-members': [answer({ count: 1 })] }).open();
    flow.fill({ subject_ids: [OTHER] });
    await flow.submit();
    const filters: unknown[] = [];
    const data = { list: async (_r: unknown, params: { filter: unknown }) => (filters.push(params.filter), { data: [{ id: MEMBERSHIP }] }) } as never;
    expect(await addApplied('add_profiles')(checkContext(manual, data))).toBe('applied');
    expect(JSON.stringify(filters[0])).toContain(OTHER);
    expect(JSON.stringify(filters[0])).toContain('"value":"manual"');
    expect(await addApplied('add_profiles')(checkContext(manual, reading(null, [])))).toBe('not-applied');
    expect(await addApplied('add_profiles')(checkContext({ id: 'never-sent' }, reading(null, [])))).toBe('unknown');
  });
});

describe('add to segment', () => {
  it('should add this profile to the chosen segment', async () => {
    const person = { id: PERSON, processing_restricted: false };
    const flow = await flowOn(PROFILE_RESOURCE, 'add_to_segment', person, { 'itap:add-segment-members': [answer({ count: 1 })] }).open();
    flow.fill({ segment_id: SEGMENT });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { segmentId: SEGMENT, subjectIds: [PERSON] } });
  });

  it('should not be offered to a restricted person or a merged identity', async () => {
    (await flowOn(PROFILE_RESOURCE, 'add_to_segment', { id: PERSON, processing_restricted: true }).open()).assertUnavailable();
    (await flowOn(IDENTITY_RESOURCE, 'add_to_segment', { id: FACE, status: 'merged' }).open()).assertUnavailable();
  });

  it('should offer only segments of the record’s kind that are not archived', () => {
    const candidates = addToSegmentFlow('identities').form.fields.segment_id;
    expect(JSON.stringify(candidates)).toContain('"value":"identities"');
    expect(JSON.stringify(candidates)).toContain('"value":"archived"');
  });
});

describe('remove from segment', () => {
  it('should end a current manual membership of this person', async () => {
    const flow = await flowOn(SEGMENT_PROFILE_MEMBER_RESOURCE, 'remove_from_segment', membership, {
      'itap:remove-segment-members': [answer({ count: 1 })],
    }).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { segmentId: SEGMENT, subjectIds: [PERSON] } });
  });

  it('should not offer to remove a rule membership or one that ended', async () => {
    (await flowOn(SEGMENT_PROFILE_MEMBER_RESOURCE, 'remove_from_segment', { ...membership, source: 'rule' }).open()).assertUnavailable();
    (await flowOn(SEGMENT_PROFILE_MEMBER_RESOURCE, 'remove_from_segment', { ...membership, removed_at: '2026-10-02T00:00:00Z' }).open()).assertUnavailable();
    const face = { id: MEMBERSHIP, segment_id: SEGMENT, identity_id: FACE, source: 'manual', removed_at: null };
    const flow = await flowOn(SEGMENT_IDENTITY_MEMBER_RESOURCE, 'remove_from_segment', face, { 'itap:remove-segment-members': [answer({ count: 1 })] }).open();
    await flow.submit();
    await flow.accept();
    expect(flow.submitted[0]?.call).toMatchObject({ input: { subjectIds: [FACE] } });
  });

  it('should check a lost answer by whether the membership has ended', async () => {
    expect(await removeApplied('profiles')(checkContext(membership, reading({ removed_at: '2026-10-22T10:00:00Z' })))).toBe('applied');
    expect(await removeApplied('profiles')(checkContext(membership, reading({ removed_at: null })))).toBe('not-applied');
  });
});

describe('membership refusals', () => {
  const sql = (operation: string, code: string) =>
    ACTION_REFUSALS[`segments.${operation}`]?.({ code: 'permission-error', message: `Check constraint violation. ${code}` }, {})?.[0];

  it('should read the refusals of adding and removing members', () => {
    expect(sql('addSegmentMembers', 'segment_archived')?.message).toMatch(/archived/);
    expect(sql('addSegmentMembers', 'subject_restricted')?.message).toMatch(/restricted/);
    expect(sql('addSegmentMembers', 'identity_merged')?.message).toMatch(/merged into another/);
    expect(sql('removeSegmentMembers', 'segment_not_found')?.message).toMatch(/no longer exists/);
  });

  it('should name the condition an evaluation refused, and leave other errors alone', () => {
    const read = ACTION_REFUSALS['segments.evaluateSegment'];
    const refused = read?.({ code: 'segment_condition_invalid', message: 'segment_condition_invalid:$.children[1].value' }, { conditions: CONDITIONS });
    expect(refused?.[0]?.message).toContain('the value of the condition on “end_date” (2)');
    expect(read?.({ code: 'segment_not_dynamic', message: '' }, {})?.[0]?.message).toMatch(/Only a dynamic segment/);
    expect(read?.({ code: 'unexpected', message: 'boom' }, {})).toBeNull();
  });
});

describe('preview', () => {
  it('should preview only a target with conditions', () => {
    expect(previewSnapshot('profiles', CONDITIONS)).toEqual({ target: 'profiles', conditions: CONDITIONS });
    expect(previewSnapshot(null, CONDITIONS)).toBeNull();
    expect(previewSnapshot('profiles', {})).toBeNull();
    expect(previewSnapshot('profiles', 'x')).toBeNull();
  });

  it('should tell a changed form from the previewed one', () => {
    const asked = previewSnapshot('profiles', CONDITIONS);
    expect(sameSnapshot(asked, previewSnapshot('profiles', { ...CONDITIONS }))).toBe(true);
    expect(sameSnapshot(asked, previewSnapshot('identities', CONDITIONS))).toBe(false);
    expect(sameSnapshot(asked, null)).toBe(false);
  });

  it('should name a refused condition and count the matches not named', () => {
    const error = { kind: 'protocol', details: [{ message: 'segment_condition_invalid:$.children[0].value', extensions: { code: 'segment_condition_invalid' } }] };
    expect(previewRefusal(error, CONDITIONS)).toBe('the value of the condition on “visits_last_30d” (1)');
    expect(previewRefusal({ message: 'timeout' }, CONDITIONS)).toBeNull();
    expect([unnamedMatches(25, 10), unnamedMatches(3, 3)]).toEqual([15, 0]);
  });
});
