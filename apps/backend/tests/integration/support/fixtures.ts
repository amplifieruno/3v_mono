import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { expect } from 'vitest';
import { HasuraError } from '../../../src/hasura/client.js';
import { asAdmin, testEnv } from './clients.js';
import { trackFile, trackOrganization, trackUser } from './registry.js';

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
  trackUser(data.insertUser.id);
  return data.insertUser;
}

/** Resolves to the rejection reason; throws `<message>, got data: ...` when the promise resolves. */
async function rejectionOf(promise: Promise<unknown>, message: string): Promise<unknown> {
  let value: unknown;
  try {
    value = await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error(`${message}, got data: ${JSON.stringify(value)}`);
}

/** Pass as `expected` to `expectDenied` when an insert/update permission check (not a missing field) must fail. */
export const PERMISSION_CHECK = Symbol('permission-check');

/**
 * Asserts the operation is denied for the expected reason, so a typo cannot make the test pass:
 * - `expected` = a field name: the error must be `field '<name>' not found in type: ...` (the role does not see
 *   that root field / column / input field);
 * - `expected` = PERMISSION_CHECK: the error must be a `permission-error` (a row failed a permission check).
 */
export async function expectDenied(promise: Promise<unknown>, expected: string | typeof PERMISSION_CHECK): Promise<HasuraError> {
  const rejection = await rejectionOf(promise, 'Expected a denied GraphQL operation');
  expect(rejection).toBeInstanceOf(HasuraError);
  const error = rejection as HasuraError;
  if (expected === PERMISSION_CHECK) {
    expect(error.code).toBe('permission-error');
    expect(error.message).toMatch(/permission/);
  } else {
    expect(error.code).toBe('validation-failed');
    expect(error.message).toContain(`field '${expected}' not found in type`);
  }
  return error;
}

/**
 * Asserts a storage.files write was refused by the sensitive-kind trigger (`itap.storage_files_sensitive_kind_guard`,
 * bd 3v_mono-ryj): Hasura reports the check violation as a `permission-error` naming the kind.
 */
export async function expectSensitiveKindRefused(promise: Promise<unknown>, kind: string): Promise<void> {
  const rejection = await rejectionOf(promise, 'Expected a refused sensitive file kind');
  expect(rejection).toBeInstanceOf(HasuraError);
  expect((rejection as HasuraError).code).toBe('permission-error');
  expect((rejection as HasuraError).message).toContain(`file_kind_sensitive:${kind}`);
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
  trackOrganization(data.insert_organizations_one.id);
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
  const rejection = await rejectionOf(promise, 'Expected an error');
  expect(rejection).toBeInstanceOf(HasuraError);
  return rejection as HasuraError;
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

/** A valid 1x1 PNG (hasura-storage sniffs the content type). */
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export type UploadResult = { id: string } | { status: number };

/**
 * Uploads a small text file through hasura-storage (multipart `POST {NHOST_STORAGE_URL}/files`).
 * Form fields: `bucket-id`, `file[]`, and `metadata[]` = JSON `{ name, metadata }` (hasura-storage 0.7 shape).
 */
export async function uploadFile(
  token: string,
  bucketId: string,
  metadata?: Record<string, unknown>,
  mimeType = 'text/plain',
): Promise<UploadResult> {
  const name = `test-${randomUUID()}.${mimeType === 'text/plain' ? 'txt' : 'png'}`;
  const form = new FormData();
  form.append('bucket-id', bucketId);
  form.append('metadata[]', JSON.stringify({ name, ...(metadata ? { metadata } : {}) }));
  form.append('file[]', new Blob([mimeType === 'image/png' ? PNG_PIXEL : 'hello itap'], { type: mimeType }), name);
  const res = await fetch(`${testEnv().NHOST_STORAGE_URL}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) return { status: res.status };
  const body = (await res.json()) as { processedFiles?: { id: string }[] };
  const id = body.processedFiles?.[0]?.id;
  if (!id) throw new Error(`uploadFile: no processed file in response ${JSON.stringify(body)}`);
  trackFile(id);
  return { id };
}
