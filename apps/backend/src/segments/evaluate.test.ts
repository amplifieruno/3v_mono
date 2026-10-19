import { describe, expect, it } from 'vitest';
import { HasuraError } from '../hasura/client.js';
import { mapSegmentError, SegmentError } from './evaluate.js';
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

  it('should leave other errors alone', () => {
    const other = new HasuraError('unexpected', 'database query error');
    expect(mapSegmentError(other)).toBe(other);
    const plain = new Error('boom');
    expect(mapSegmentError(plain)).toBe(plain);
  });
});
