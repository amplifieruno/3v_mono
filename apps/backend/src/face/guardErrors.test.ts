import { describe, expect, it } from 'vitest';
import { HasuraError } from '../hasura/client.js';
import { EnrollmentError, mapGuardError } from './guardErrors.js';

describe('mapGuardError', () => {
  it.each(['identity_matching_disabled', 'identity_merged_frozen'])('should map the SQL guard %s to a coded error', (code) => {
    const mapped = mapGuardError(new HasuraError('constraint-violation', `database query error`, 'path', `${code}: blocked`));
    expect(mapped).toBeInstanceOf(EnrollmentError);
    expect((mapped as EnrollmentError).code).toBe(code);
  });

  it('should map the restriction guards to subject_restricted', () => {
    for (const code of ['profile_processing_restricted', 'subject_restricted']) {
      const mapped = mapGuardError(new HasuraError('constraint-violation', 'database query error', 'path', `${code}`));
      expect((mapped as EnrollmentError).code).toBe('subject_restricted');
    }
  });

  it('should map a guard named only in the message', () => {
    const mapped = mapGuardError(new HasuraError('unexpected', 'identity_merged_frozen'));
    expect((mapped as EnrollmentError).code).toBe('identity_merged_frozen');
  });

  it('should pass other errors through unchanged', () => {
    const other = new HasuraError('unexpected', 'boom');
    expect(mapGuardError(other)).toBe(other);
    const plain = new Error('x');
    expect(mapGuardError(plain)).toBe(plain);
  });
});
