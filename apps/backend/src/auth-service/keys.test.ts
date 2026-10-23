import { describe, expect, it } from 'vitest';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { serverKeys } from './crypto.js';
import { ClientKeyError, issueClientKey, sqlCode } from './keys.js';

const KEYS = serverKeys('0'.repeat(64));

/** An actor whose store_client_key call fails with `error`. */
const failingActor = (error: Error): HasuraClient => ({ request: async () => Promise.reject(error) }) as unknown as HasuraClient;

describe('sqlCode', () => {
  it('should read the codes store_client_key raises itself', () => {
    expect(sqlCode(new HasuraError('unexpected', 'database query error', undefined, 'client_key_limit'))).toBe('client_key_limit');
  });

  it('should read the refusal of the active member guard and of the session organization', () => {
    expect(sqlCode(new HasuraError('unexpected', 'member_required'))).toBe('member_required');
    expect(sqlCode(new HasuraError('unexpected', 'database query error', undefined, 'organization_required'))).toBe('organization_required');
  });

  it('should read nothing from other errors', () => {
    expect(sqlCode(new HasuraError('unexpected', 'connection reset'))).toBeUndefined();
    expect(sqlCode(new Error('member_required'))).toBeUndefined();
  });
});

describe('issueClientKey', () => {
  it('should surface member_required as a client key refusal', async () => {
    const actor = failingActor(new HasuraError('unexpected', 'database query error', undefined, 'member_required'));
    await expect(issueClientKey(actor, KEYS, '00000000-0000-4000-8000-000000000001', null)).rejects.toMatchObject({
      name: 'ClientKeyError',
      code: 'member_required',
    });
    await expect(issueClientKey(actor, KEYS, '00000000-0000-4000-8000-000000000001', null)).rejects.toBeInstanceOf(ClientKeyError);
  });
});
