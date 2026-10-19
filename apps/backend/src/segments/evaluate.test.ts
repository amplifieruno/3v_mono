import { describe, expect, it } from 'vitest';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { profileCatalog } from './catalog.fixture.js';
import { mapSegmentError, matchingSubjects, SegmentError } from './evaluate.js';
import { SegmentTranslateError } from './types.js';

describe('mapSegmentError', () => {
  it('should turn SQL segment codes (with paths) and translator errors into SegmentErrors', () => {
    const sql = mapSegmentError(new HasuraError('constraint-violation', 'segment_condition_invalid:$.children[0].field'));
    expect(sql).toBeInstanceOf(SegmentError);
    expect(sql).toMatchObject({ code: 'segment_condition_invalid', message: 'segment_condition_invalid:$.children[0].field' });
    const detail = mapSegmentError(new HasuraError('unexpected', 'database query error', undefined, 'segment_not_dynamic'));
    expect(detail).toMatchObject({ code: 'segment_not_dynamic' });
    expect(mapSegmentError(new SegmentTranslateError('$.value', 'bad'))).toMatchObject({
      code: 'segment_condition_invalid',
      message: 'segment_condition_invalid:$.value',
    });
  });

  it('should map only the known codes, not any segment_* text', () => {
    const graphql = new HasuraError('validation-failed', "field 'segment_members' not found in type: 'query_root'");
    expect(mapSegmentError(graphql)).toBe(graphql);
    const unknown = new HasuraError('constraint-violation', 'segment_member_immutable');
    expect(mapSegmentError(unknown)).toBe(unknown);
  });

  it('should leave other errors alone', () => {
    const other = new HasuraError('unexpected', 'database query error');
    expect(mapSegmentError(other)).toBe(other);
    const plain = new Error('boom');
    expect(mapSegmentError(plain)).toBe(plain);
  });
});

describe('matchingSubjects', () => {
  type Call = { query: string; variables: Record<string, unknown> | undefined };

  function fakeReader(pages: string[][]): { reader: HasuraClient; calls: Call[] } {
    const calls: Call[] = [];
    let page = 0;
    const reader: HasuraClient = {
      async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
        calls.push({ query, variables });
        if (query.includes('segment_evaluation_context')) {
          const row = { organization_id: 'org-1', local_date: '2026-10-01', day_start: 'a', day_end: 'b', on_shift_schedule_ids: [], segment_active: null };
          return { segment_evaluation_context: [row] } as T;
        }
        if (query.includes('segment_fields')) return { segment_fields: profileCatalog } as T;
        const ids = pages[page++] ?? [];
        return { rows: ids.map((id) => ({ id })) } as T;
      },
    };
    return { reader, calls };
  }

  it('should validate the conditions at the given time and return every matching id in id order', async () => {
    const { reader, calls } = fakeReader([['p1', 'p2']]);
    const conditions = { field: 'profile_type', operator: 'eq', value: 'vip' };
    const ids = await matchingSubjects(reader, { target: 'profiles', conditions, at: '2026-10-01T20:59:59.000Z' });
    expect(ids).toEqual(['p1', 'p2']);
    // The context call validates the conditions (p_conditions) for the evaluation time.
    expect(calls[0].variables).toMatchObject({ at: '2026-10-01T20:59:59.000Z', target: 'profiles', conditions, segment: null });
    const where = calls[2].variables?.where as Record<string, unknown[]>;
    expect(JSON.stringify(where)).toContain('"profile_type":{"_eq":"vip"}');
    expect(JSON.stringify(where)).toContain('"organization_id":{"_eq":"org-1"}');
  });
});
