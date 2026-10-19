import { removeTestData, type CleanupCounts } from '../../../src/scripts/test-cleanup.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { asAdmin, testEnv } from './clients.js';

/**
 * Fixture registry: every organization, user and stray file a suite creates is recorded here and removed
 * in `afterAll` (registered for every suite by `setup.ts`), so the dev database keeps only demo data.
 */
const created = { organizations: new Set<string>(), users: new Set<string>(), files: new Set<string>() };

export function trackOrganization(id: string): void {
  created.organizations.add(id);
}

export function trackUser(id: string): void {
  created.users.add(id);
}

/** Files outside an organization bucket (e.g. the shared org-logos bucket). */
export function trackFile(id: string): void {
  created.files.add(id);
}

/** Removes everything tracked so far (files via storage, then orgs + buckets + audit rows, then users). */
export async function cleanupFixtures(): Promise<CleanupCounts> {
  const organizationIds = [...created.organizations];
  const counts = await removeTestData(asAdmin(), createStorageClient(testEnv()), {
    organizationIds,
    bucketIds: organizationIds,
    userIds: [...created.users],
    fileIds: [...created.files],
  });
  created.organizations.clear();
  created.users.clear();
  created.files.clear();
  return counts;
}
