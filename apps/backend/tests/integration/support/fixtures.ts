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

export type MemberStatus = 'active' | 'suspended' | 'deactivated';

const INSERT_ORG = `
  mutation InsertTestOrg($object: organizations_insert_input!) {
    insert_organizations_one(object: $object) { id name slug }
  }
`;

/** Creates an organization (admin); its settings row is created by trigger. */
export async function createTestOrg(name?: string): Promise<{ id: string; name: string; slug: string }> {
  const suffix = randomUUID();
  const data = await asAdmin().request<{ insert_organizations_one: { id: string; name: string; slug: string } | null }>(
    INSERT_ORG,
    { object: { name: name ?? `Test Org ${suffix.slice(0, 8)}`, slug: `test-${suffix}` } },
  );
  if (!data.insert_organizations_one) throw new Error('createTestOrg: insert returned no row');
  return data.insert_organizations_one;
}

const INSERT_MEMBER = `
  mutation InsertTestMember($object: organization_members_insert_input!) {
    insert_organization_members_one(object: $object) { id }
  }
`;

/** Adds `userId` to `orgId` (admin). A deactivated member also gets `deactivated_at` (CHECK constraint). */
export async function addMember(
  orgId: string,
  userId: string,
  status: MemberStatus = 'active',
): Promise<{ id: string }> {
  const object: Record<string, unknown> = { organization_id: orgId, user_id: userId, status };
  if (status === 'deactivated') object.deactivated_at = new Date().toISOString();
  const data = await asAdmin().request<{ insert_organization_members_one: { id: string } | null }>(INSERT_MEMBER, {
    object,
  });
  if (!data.insert_organization_members_one) throw new Error('addMember: insert returned no row');
  return data.insert_organization_members_one;
}

/** Resolves to the HasuraError the operation fails with (fails the test if it succeeds). */
export async function expectError(promise: Promise<unknown>): Promise<HasuraError> {
  const outcome = await promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (outcome.ok) throw new Error(`Expected an error, got data: ${JSON.stringify(outcome.value)}`);
  expect(outcome.error).toBeInstanceOf(HasuraError);
  return outcome.error as HasuraError;
}

type TestOrg = { id: string; name: string; slug: string };
type TestUser = { id: string; email: string };

/** Two orgs; `user` is an active member of A, `other` an active member of B. */
export async function createTwoOrgs(): Promise<{ orgA: TestOrg; orgB: TestOrg; user: TestUser; other: TestUser }> {
  const [orgA, orgB, user, other] = await Promise.all([
    createTestOrg('Org A'),
    createTestOrg('Org B'),
    createTestUser(),
    createTestUser(),
  ]);
  await addMember(orgA.id, user.id);
  await addMember(orgB.id, other.id);
  return { orgA, orgB, user, other };
}
