import { describe, expect, it } from 'vitest';
import { toFunction } from './introspect.js';

const base = {
  schema: 'itap',
  name: 'f',
  volatility: 'v',
  returnsSet: true,
  returnSchema: 'itap',
  returnTable: 'identities',
};

describe('toFunction', () => {
  it('should keep every argument when the function has only input arguments (proargmodes null)', () => {
    const row = toFunction({
      ...base,
      argNames: ['hasura_session', 'p_id'],
      argModes: null,
      argTypes: ['json', 'uuid'],
    });
    expect(row.argNames).toEqual(['hasura_session', 'p_id']);
    expect(row.argTypes).toEqual(['json', 'uuid']);
  });

  it('should drop OUT and TABLE arguments so names and types stay aligned', () => {
    const out = toFunction({
      ...base,
      argNames: ['out_count', 'hasura_session', 'p_id'],
      argModes: ['o', 'i', 'i'],
      argTypes: ['integer', 'json', 'uuid'],
    });
    expect(out.argNames).toEqual(['hasura_session', 'p_id']);
    expect(out.argTypes).toEqual(['json', 'uuid']);

    const table = toFunction({
      ...base,
      argNames: ['hasura_session', 'p_ids', 'id', 'score'],
      argModes: ['i', 'v', 't', 't'],
      argTypes: ['json', 'uuid[]', 'uuid', 'real'],
    });
    expect(table.argNames).toEqual(['hasura_session', 'p_ids']);
    expect(table.argTypes).toEqual(['json', 'uuid[]']);
  });

  it('should keep INOUT arguments and fill missing names with empty strings', () => {
    const row = toFunction({
      ...base,
      argNames: [],
      argModes: ['b', 'i'],
      argTypes: ['json', 'text'],
    });
    expect(row.argNames).toEqual(['', '']);
    expect(row.argTypes).toEqual(['json', 'text']);
  });

  it('should reject rows whose modes and types disagree in length', () => {
    expect(() =>
      toFunction({
        ...base,
        argNames: [],
        argModes: ['i'],
        argTypes: ['json', 'text'],
      }),
    ).toThrow(/bad function row/);
  });
});
