import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { expect } from 'vitest';
import { HasuraError } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';

export const TEST_PASSWORD = 'Test-Password-123!';

// Hashing is slow; one hash is enough for every test user.
let passwordHash: string | undefined;

const INSERT_USER = `
  mutation InsertTestUser($object: users_insert_input!) {
    insertUser(object: $object) { id email }
  }
`;

/** Creates a verified Nhost auth user with roles `user` and `me`. */
export async function createTestUser(email?: string): Promise<{ id: string; email: string }> {
  passwordHash ??= await bcrypt.hash(TEST_PASSWORD, 10);
  const data = await asAdmin().request<{ insertUser: { id: string; email: string } | null }>(INSERT_USER, {
    object: {
      email: email ?? `test-${randomUUID()}@itap.test`,
      passwordHash,
      defaultRole: 'user',
      locale: 'en',
      emailVerified: true,
      roles: { data: [{ role: 'user' }, { role: 'me' }] },
    },
  });
  if (!data?.insertUser) throw new Error('createTestUser: insertUser returned no row');
  return data.insertUser;
}

const DENIED_CODES = ['permission-error', 'validation-failed', 'access-denied'];

/** Asserts the operation fails with a GraphQL permission/validation error; returns the error. */
export async function expectDenied(promise: Promise<unknown>): Promise<HasuraError> {
  const outcome = await promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (outcome.ok) {
    throw new Error(`Expected a denied GraphQL operation, got data: ${JSON.stringify(outcome.value)}`);
  }
  expect(outcome.error).toBeInstanceOf(HasuraError);
  const error = outcome.error as HasuraError;
  expect(DENIED_CODES).toContain(error.code);
  return error;
}
