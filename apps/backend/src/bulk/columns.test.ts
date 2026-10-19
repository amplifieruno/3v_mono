import { describe, expect, it } from 'vitest';
import { resolveBulkOptions, rowValues, validateHeader } from './columns.js';

const custom = new Set(['badge', 'Shirt_Size']);

describe('validateHeader', () => {
  it('should accept the documented profile_import columns and custom.<key>', () => {
    const header = [
      'first_name', 'last_name', 'email', 'phone', 'profile_type', 'company', 'department', 'job_title', 'employee_id',
      'start_date', 'end_date', 'access_level', 'work_schedule', 'custom.badge',
    ];
    expect(validateHeader('profile_import', header, { updateKey: 'employee_id', customKeys: custom })).toEqual({
      ok: true,
      columns: header,
    });
  });

  it('should normalize case and whitespace of standard columns but keep custom keys', () => {
    expect(validateHeader('profile_import', [' First_Name ', 'LAST_NAME', 'Custom.Shirt_Size'], { updateKey: 'employee_id', customKeys: custom }))
      .toEqual({ ok: true, columns: ['first_name', 'last_name', 'custom.Shirt_Size'] });
  });

  it('should reject unknown, duplicate, empty and missing required columns', () => {
    const o = { updateKey: 'employee_id', customKeys: custom };
    expect(validateHeader('profile_import', ['first_name', 'last_name', 'salary'], o)).toEqual({ ok: false, error: 'header_unknown:salary' });
    expect(validateHeader('profile_import', ['first_name', 'last_name', 'custom.nope'], o)).toEqual({ ok: false, error: 'header_unknown:custom.nope' });
    expect(validateHeader('profile_import', ['first_name', 'last_name', 'First_Name'], o)).toEqual({ ok: false, error: 'header_duplicate:first_name' });
    expect(validateHeader('profile_import', ['first_name', '', 'last_name'], o)).toEqual({ ok: false, error: 'header_empty_column' });
    expect(validateHeader('profile_import', ['first_name'], o)).toEqual({ ok: false, error: 'header_missing:last_name' });
    expect(validateHeader('profile_import', ['first_name', 'last_name', 'code'], o)).toEqual({ ok: false, error: 'header_unknown:code' });
  });

  it('should require the update key column and one more column for profile_update', () => {
    expect(validateHeader('profile_update', ['code', 'department'], { updateKey: 'code', customKeys: custom })).toEqual({
      ok: true,
      columns: ['code', 'department'],
    });
    expect(validateHeader('profile_update', ['email', 'department'], { updateKey: 'employee_id', customKeys: custom })).toEqual({
      ok: false,
      error: 'header_missing:employee_id',
    });
    expect(validateHeader('profile_update', ['employee_id'], { updateKey: 'employee_id', customKeys: custom })).toEqual({
      ok: false,
      error: 'header_no_update_columns',
    });
    expect(validateHeader('profile_update', ['employee_id', 'code'], { updateKey: 'employee_id', customKeys: custom })).toEqual({
      ok: false,
      error: 'header_unknown:code',
    });
  });

  it('should accept image_file_id and label for bulk_search only', () => {
    const o = { updateKey: 'employee_id', customKeys: custom };
    expect(validateHeader('bulk_search', ['image_file_id', 'label'], o)).toEqual({ ok: true, columns: ['image_file_id', 'label'] });
    expect(validateHeader('bulk_search', ['label'], o)).toEqual({ ok: false, error: 'header_missing:image_file_id' });
    expect(validateHeader('bulk_search', ['image_file_id', 'first_name'], o)).toEqual({ ok: false, error: 'header_unknown:first_name' });
  });
});

describe('rowValues', () => {
  const header = ['first_name', 'last_name', 'custom.badge'];

  it('should map trimmed non-empty cells by column', () => {
    expect(rowValues(header, [' Ada ', 'Lovelace', ''])).toEqual({ kind: 'values', values: { first_name: 'Ada', last_name: 'Lovelace' } });
  });

  it('should report blank records and column count mismatches', () => {
    expect(rowValues(header, [''])).toEqual({ kind: 'blank' });
    expect(rowValues(header, [' ', '', ''])).toEqual({ kind: 'blank' });
    expect(rowValues(header, ['a', 'b'])).toEqual({ kind: 'mismatch' });
  });
});

describe('resolveBulkOptions', () => {
  it('should default the update key and dry run', () => {
    expect(resolveBulkOptions({})).toEqual({ updateKey: 'employee_id', dryRun: false, threshold: null, maxResults: 5 });
    expect(resolveBulkOptions({ update_key: 'code', dry_run: true, threshold: 0.4, max_results: 3 })).toEqual({
      updateKey: 'code',
      dryRun: true,
      threshold: 0.4,
      maxResults: 3,
    });
  });
});
