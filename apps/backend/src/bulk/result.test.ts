import { describe, expect, it } from 'vitest';
import { resultCsv, type JobRow } from './result.js';

const base: JobRow = {
  row_no: 1,
  outcome: 'created',
  profile_id: 'p1',
  identity_id: null,
  search_request_id: null,
  entity_code: 'PROFILE-00001',
  label: null,
  confidence: null,
  error: null,
};

describe('resultCsv', () => {
  it('should write one line per row for profile jobs', () => {
    const text = resultCsv('profile_import', [
      base,
      { ...base, row_no: 2, outcome: 'failed', profile_id: null, entity_code: null, error: 'custom_field_invalid:badge' },
    ]).toString('utf8');
    expect(text.split('\r\n')).toEqual([
      'row_no,outcome,entity_id,entity_code,error',
      '1,created,p1,PROFILE-00001,',
      '2,failed,,,custom_field_invalid:badge',
      '',
    ]);
  });

  it('should add label, confidence and search request for bulk_search and guard formula-like text', () => {
    const text = resultCsv('bulk_search', [
      { ...base, outcome: 'matched', profile_id: null, identity_id: 'i1', entity_code: 'ID-00007', label: '=cmd', confidence: 0.81, search_request_id: 'r1' },
    ]).toString('utf8');
    expect(text.split('\r\n')).toEqual([
      'row_no,outcome,entity_id,entity_code,error,label,confidence,search_request_id',
      "1,matched,i1,ID-00007,,'=cmd,0.81,r1",
      '',
    ]);
  });
});
