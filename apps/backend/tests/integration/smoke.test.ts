import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asBearer, asOrgAdmin, asUser } from './support/clients.js';
import { createTestUser, expectDenied } from './support/fixtures.js';
import { signBaseToken } from '../../src/auth/hasuraJwt.js';

describe('integration harness smoke', () => {
  it('should create a test user in Nhost auth', async () => {
    const user = await createTestUser();
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.email).toContain('@');
  });

  it('should let a user-role token query __typename', async () => {
    const user = await createTestUser();
    const data = await asUser(user.id).request<{ __typename: string }>('{ __typename }');
    expect(data.__typename).toBe('query_root');
  });

  it('should reject a token signed with the wrong key as invalid-jwt', async () => {
    const user = await createTestUser();
    const { token } = signBaseToken(
      { userId: user.id, ttlSeconds: 60 },
      { type: 'HS256', key: 'not-the-real-key-not-the-real-key-0123456789' },
    );
    await expect(asBearer(token).request('{ __typename }')).rejects.toMatchObject({ code: 'invalid-jwt' });
  });

  it('should let an org_admin token query __typename', async () => {
    const user = await createTestUser();
    const data = await asOrgAdmin(user.id, randomUUID()).request<{ __typename: string }>('{ __typename }');
    expect(data.__typename).toBe('query_root');
  });

  it('should report a user querying admin-only fields as denied', async () => {
    const user = await createTestUser();
    const error = await expectDenied(asUser(user.id).request('{ authRoles { role } }'));
    expect(error.code).toBe('validation-failed');
  });

  it('should fail expectDenied when the operation succeeds', async () => {
    const user = await createTestUser();
    await expect(expectDenied(asUser(user.id).request('{ __typename }'))).rejects.toThrow(/Expected a denied/);
  });
});
