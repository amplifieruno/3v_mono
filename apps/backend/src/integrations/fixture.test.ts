import { describe, expect, it } from 'vitest';
import { mapRecord, normalizeValue, parseFieldMapping, parseFixture, SyncFailure } from './fixture.js';

describe('parseFixture', () => {
  it('should read a JSON array, a JSON {records} document and a CSV with a header row', () => {
    expect(parseFixture(Buffer.from('[{"id":"1"}]'))).toEqual([{ id: '1' }]);
    expect(parseFixture(Buffer.from(' {"records":[{"id":"2"}]}'))).toEqual([{ id: '2' }]);
    expect(parseFixture(Buffer.from('\uFEFFid,name\r\n3,"Lee, Ann"\r\n'))).toEqual([{ id: '3', name: 'Lee, Ann' }]);
  });

  it('should refuse malformed or oversized fixtures with a code', () => {
    expect(() => parseFixture(Buffer.from('{"rows":1}'))).toThrow(SyncFailure);
    expect(() => parseFixture(Buffer.from('[1'))).toThrow(/fixture_invalid/);
    expect(() => parseFixture(Buffer.from('a,b\r\n"x'))).toThrow(/fixture_invalid/);
    expect(() => parseFixture(Buffer.from(JSON.stringify(Array.from({ length: 10001 }, () => ({})))))).toThrow(/fixture_too_large/);
  });
});

describe('parseFieldMapping', () => {
  it('should accept profile columns and custom_fields.<key> targets only', () => {
    expect(parseFieldMapping({ given: 'first_name', badge: 'custom_fields.badge' })).toEqual({ given: 'first_name', badge: 'custom_fields.badge' });
    expect(() => parseFieldMapping({ x: 'source_integration_id' })).toThrow(/field_mapping_invalid:x/);
    expect(() => parseFieldMapping({ x: 'custom_fields.' })).toThrow(/field_mapping_invalid/);
    expect(() => parseFieldMapping({ x: 3 })).toThrow(/field_mapping_invalid/);
  });
});

describe('mapRecord', () => {
  const mapping = { given: 'first_name', family: 'last_name', badge: 'custom_fields.badge' };

  it('should map fields, trim text, turn blanks into null and skip absent keys', () => {
    expect(mapRecord({ emp: ' E1 ', given: ' Ann ', family: '', badge: 7 }, mapping, 'emp')).toEqual({
      externalId: 'E1',
      fields: { first_name: 'Ann', last_name: null },
      customFields: { badge: '7' },
    });
    expect(mapRecord({ emp: 5, given: 'Bo' }, mapping, 'emp')).toEqual({ externalId: '5', fields: { first_name: 'Bo' }, customFields: {} });
  });

  it('should use the identity mapping for known columns when no mapping is configured', () => {
    expect(mapRecord({ external_id: 'X', first_name: 'A', unknown: 'z' }, {}, 'external_id')).toEqual({
      externalId: 'X',
      fields: { first_name: 'A' },
      customFields: {},
    });
  });

  it('should return a code for a bad record', () => {
    expect(mapRecord('text', mapping, 'emp')).toEqual({ error: 'invalid_record' });
    expect(mapRecord({ given: 'A' }, mapping, 'emp')).toEqual({ error: 'missing_external_id' });
    expect(mapRecord({ emp: ' ' }, mapping, 'emp')).toEqual({ error: 'missing_external_id' });
    expect(mapRecord({ emp: 'E', given: { a: 1 } }, mapping, 'emp')).toEqual({ error: 'invalid_value:first_name' });
  });
});

describe('normalizeValue', () => {
  it('should canonicalise dates and code columns and refuse invalid dates', () => {
    expect(normalizeValue('start_date', '2024-01-05T00:00:00Z')).toBe('2024-01-05');
    expect(normalizeValue('start_date', '2024-01-05')).toBe('2024-01-05');
    expect(normalizeValue('end_date', 'January 5, 2024 12:00 UTC')).toBe('2024-01-05');
    expect(normalizeValue('end_date', 'soon')).toBeUndefined();
    expect(normalizeValue('profile_type', 'Employee')).toBe('employee');
    expect(normalizeValue('first_name', 'Ann')).toBe('Ann');
    expect(normalizeValue('start_date', null)).toBeNull();
  });
});
