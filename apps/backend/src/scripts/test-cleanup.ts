/**
 * Removes integration-test leftovers: organizations with slug `test-%`, users with an `@itap.test` email,
 * the files in their buckets (through hasura-storage, so object storage stays consistent), orphaned
 * organization buckets (uuid bucket id without an organization) and the audit rows of those organizations.
 *
 * `removeTestData` is also used by the integration-test fixture registry to clean up after each suite.
 * Usage: `pnpm --filter backend test:cleanup`.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { createStorageClient, type StorageClient } from '../storage/storageClient.js';

export type CleanupScope = {
  organizationIds: string[];
  /** Buckets to empty and remove (an organization's bucket id is its uuid). */
  bucketIds: string[];
  userIds: string[];
  /** Extra files outside those buckets (e.g. uploads to the shared org-logos bucket). */
  fileIds: string[];
};

export type CleanupCounts = { files: number; organizations: number; auditRows: number; buckets: number; users: number };

const FILES = `
  query CleanupFiles($buckets: [String!]!, $ids: [uuid!]!) {
    files(where: { _or: [{ bucketId: { _in: $buckets } }, { id: { _in: $ids } }] }) { id }
  }
`;
const DELETE_FILE_ROW = `mutation CleanupFileRow($id: uuid!) { deleteFile(id: $id) { id } }`;
const DELETE_ROWS = `
  mutation CleanupRows($orgs: [uuid!]!, $buckets: [String!]!, $users: [uuid!]!, $auditOrgs: [uuid!]!) {
    delete_user_settings(where: { user_id: { _in: $users } }) { affected_rows }
    delete_organizations(where: { id: { _in: $orgs } }) { affected_rows }
    delete_audit_log(where: { organization_id: { _in: $auditOrgs } }) { affected_rows }
    deleteBuckets(where: { id: { _in: $buckets } }) { affected_rows }
    deleteUsers(where: { id: { _in: $users } }) { affected_rows }
  }
`;

type Affected = { affected_rows: number };
type DeleteRowsResult = {
  delete_user_settings: Affected;
  delete_organizations: Affected;
  delete_audit_log: Affected;
  deleteBuckets: Affected;
  deleteUsers: Affected;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deletes everything in `scope`. Files go first through the storage service (a row without a stored
 * object, e.g. inserted directly by a test, is removed through GraphQL instead); then, in one
 * transaction, user settings, organizations (FK cascade), their audit rows, the buckets and the users.
 */
export async function removeTestData(
  admin: HasuraClient,
  storage: StorageClient,
  scope: CleanupScope,
): Promise<CleanupCounts> {
  const { files } = await admin.request<{ files: { id: string }[] }>(FILES, {
    buckets: scope.bucketIds,
    ids: scope.fileIds,
  });
  for (const file of files) {
    try {
      await storage.deleteFile(file.id);
    } catch {
      await admin.request(DELETE_FILE_ROW, { id: file.id });
    }
  }
  const auditOrgs = [...new Set([...scope.organizationIds, ...scope.bucketIds.filter((id) => UUID.test(id))])];
  const data = await admin.request<DeleteRowsResult>(DELETE_ROWS, {
    orgs: scope.organizationIds,
    buckets: scope.bucketIds,
    users: scope.userIds,
    auditOrgs,
  });
  return {
    files: files.length,
    organizations: data.delete_organizations.affected_rows,
    auditRows: data.delete_audit_log.affected_rows,
    buckets: data.deleteBuckets.affected_rows,
    users: data.deleteUsers.affected_rows,
  };
}

const LEFTOVERS = `
  query CleanupLeftovers {
    organizations(where: { slug: { _like: "test-%" } }) { id }
    all: organizations { id }
    buckets { id }
    users(where: { email: { _like: "%@itap.test" } }) { id }
  }
`;

type Leftovers = {
  organizations: { id: string }[];
  all: { id: string }[];
  buckets: { id: string }[];
  users: { id: string }[];
};

/** Finds every test leftover: test organizations and users, plus uuid buckets of test or deleted organizations. */
export async function findTestData(admin: HasuraClient): Promise<CleanupScope> {
  const data = await admin.request<Leftovers>(LEFTOVERS);
  const testOrgs = new Set(data.organizations.map((o) => o.id));
  const kept = new Set(data.all.map((o) => o.id).filter((id) => !testOrgs.has(id)));
  return {
    organizationIds: [...testOrgs],
    bucketIds: data.buckets.map((b) => b.id).filter((id) => UUID.test(id) && !kept.has(id)),
    userIds: data.users.map((u) => u.id),
    fileIds: [],
  };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const admin = createHasuraClient(env);
  const counts = await removeTestData(admin, createStorageClient(env), await findTestData(admin));
  process.stdout.write(`test:cleanup removed ${JSON.stringify(counts)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`test:cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
