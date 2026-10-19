import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asAdmin, asOrgAdmin, asUser, orgAdminToken, testEnv, userToken } from './support/clients.js';
import { createTestOrg, createTwoOrgs, expectDenied, PERMISSION_CHECK, uploadFile } from './support/fixtures.js';

async function runSql(sql: string): Promise<void> {
  const env = testEnv();
  const res = await fetch(new URL('/v2/query', env.HASURA_GRAPHQL_URL).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  if (!res.ok) throw new Error(`run_sql failed: ${await res.text()}`);
}

const BUCKET = `query B($id: String!) { bucket(id: $id) { id } }`;
const FILE = `query F($id: uuid!) { file(id: $id) { id bucketId metadata } }`;
const FILE_NO_META = `query F($id: uuid!) { file(id: $id) { id bucketId } }`;
const FILES_IN = `query FS($b: String!) { files(where: { bucketId: { _eq: $b } }) { id } }`;
const ADMIN_INSERT_FILE = `
  mutation I($object: files_insert_input!) { insertFile(object: $object) { id } }
`;

describe('per-organization storage', () => {
  it('should create a bucket for a new organization', async () => {
    const org = await createTestOrg();
    const data = await asAdmin().request<{ bucket: { id: string } | null }>(BUCKET, { id: org.id });
    expect(data.bucket?.id).toBe(org.id);
  });

  it('should provide the shared org-logos bucket', async () => {
    const data = await asAdmin().request<{ bucket: { id: string } | null }>(BUCKET, { id: 'org-logos' });
    expect(data.bucket?.id).toBe('org-logos');
  });

  it('should let an org admin upload to the own bucket (lowercase org id in token) and select the row', async () => {
    const { orgA, user } = await createTwoOrgs();
    expect(orgA.id).toBe(orgA.id.toLowerCase());
    const result = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id, { kind: 'photo' });
    expect('id' in result).toBe(true);
    if (!('id' in result)) return;
    const data = await asOrgAdmin(user.id, orgA.id).request<{ file: { bucketId: string; metadata: unknown } | null }>(
      FILE,
      { id: result.id },
    );
    expect(data.file).toMatchObject({ bucketId: orgA.id, metadata: { kind: 'photo' } });
  });

  it('should show an org admin a file uploaded with no metadata', async () => {
    const { orgA, user } = await createTwoOrgs();
    const result = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id);
    expect('id' in result).toBe(true);
    if (!('id' in result)) return;
    const data = await asOrgAdmin(user.id, orgA.id).request<{ file: { id: string } | null }>(FILE, { id: result.id });
    expect(data.file?.id).toBe(result.id);
  });

  it("should reject an upload to another organization's bucket", async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const result = await uploadFile(orgAdminToken(user.id, orgA.id), orgB.id);
    expect(result).toEqual({ status: 403 });
  });

  // hasura-storage 0.7 inserts the row WITHOUT metadata (as the caller) and then sets metadata + is_uploaded
  // as admin, so the insert-permission check cannot reject sensitive kinds on the upload path (see task report).
  // Sensitive kinds are enforced on direct GraphQL inserts, and hidden from org_admin on select.
  it.each(['profile_document', 'dsr_export', 'auth_capture'])(
    'should reject a direct %s file insert by an org admin',
    async (kind) => {
      const { orgA, user } = await createTwoOrgs();
      await expectDenied(
        asOrgAdmin(user.id, orgA.id).request(ADMIN_INSERT_FILE, {
          object: { bucketId: orgA.id, name: 's.txt', size: 1, mimeType: 'text/plain', metadata: { kind } },
        }),
        PERMISSION_CHECK,
      );
    },
  );

  it.each(['profile_document', 'dsr_export', 'auth_capture'])(
    'should keep a %s file uploaded through storage invisible to the org admin',
    async (kind) => {
      const { orgA, user } = await createTwoOrgs();
      const result = await uploadFile(orgAdminToken(user.id, orgA.id), orgA.id, { kind });
      if (!('id' in result)) throw new Error(`expected the upload to succeed, got status ${result.status}`);
      const raw = await asAdmin().request<{ file: { metadata: { kind: string } } | null }>(FILE, { id: result.id });
      expect(raw.file?.metadata.kind).toBe(kind);
      const seen = await asOrgAdmin(user.id, orgA.id).request<{ file: unknown }>(FILE, { id: result.id });
      expect(seen.file).toBeNull();
    },
  );

  it('should hide sensitive files and other buckets from org admins on select', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const sensitive = await asAdmin().request<{ insertFile: { id: string } }>(ADMIN_INSERT_FILE, {
      object: { bucketId: orgA.id, name: 's.txt', size: 1, mimeType: 'text/plain', isUploaded: true, metadata: { kind: 'profile_document' } },
    });
    await asAdmin().request(ADMIN_INSERT_FILE, {
      object: { bucketId: orgB.id, name: 'o.txt', size: 1, mimeType: 'text/plain', isUploaded: true },
    });
    const client = asOrgAdmin(user.id, orgA.id);
    expect((await client.request<{ file: unknown }>(FILE, { id: sensitive.insertFile.id })).file).toBeNull();
    expect((await client.request<{ files: unknown[] }>(FILES_IN, { b: orgB.id })).files).toHaveLength(0);
  });

  it('should share org-logos: org admin can upload and a plain user can select it', async () => {
    const { orgA, user } = await createTwoOrgs();
    const result = await uploadFile(orgAdminToken(user.id, orgA.id), 'org-logos');
    expect('id' in result).toBe(true);
    if (!('id' in result)) return;
    const asU = await asUser(user.id).request<{ file: { id: string } | null }>(FILE_NO_META, { id: result.id });
    expect(asU.file?.id).toBe(result.id);
  });

  it('should not let a plain user upload to an organization bucket', async () => {
    const { orgA, user } = await createTwoOrgs();
    expect(await uploadFile(userToken(user.id), orgA.id)).toEqual({ status: 403 });
  });

  it('should not expose delete or update mutations to org_admin', async () => {
    const { orgA, user } = await createTwoOrgs();
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(`mutation { deleteFile(id: "${randomUUID()}") { id } }`),
      'deleteFile',
    );
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(`mutation { deleteFiles(where: {}) { affected_rows } }`),
      'deleteFiles',
    );
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(`mutation { updateFile(pk_columns: {id: "${randomUUID()}"}, _set: {name: "x"}) { id } }`),
      'updateFile',
    );
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(`mutation { updateFiles(where: {}, _set: {name: "x"}) { affected_rows } }`),
      'updateFiles',
    );
  });

  it('should let org_admin read only own bucket and org-logos', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const data = await asOrgAdmin(user.id, orgA.id).request<{ buckets: { id: string }[] }>(
      `query { buckets { id } }`,
    );
    const ids = data.buckets.map((b) => b.id).sort();
    expect(ids).toEqual([orgA.id, 'org-logos'].sort());
    expect(ids).not.toContain(orgB.id);
    await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(`mutation { deleteBucket(id: "${orgA.id}") { id } }`),
      'deleteBucket',
    );
  });
});

describe('itap.check_file_bucket', () => {
  beforeAll(async () => {
    await runSql(`
      DROP TABLE IF EXISTS itap.file_scratch;
      CREATE TABLE itap.file_scratch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        file_id uuid
      );
      CREATE TRIGGER file_scratch_check BEFORE INSERT OR UPDATE ON itap.file_scratch
        FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('file_id');
    `);
  });
  afterAll(() => runSql('DROP TABLE IF EXISTS itap.file_scratch;'));

  it('should allow a file from the own bucket, null, and reject foreign or missing files', async () => {
    const { orgA, orgB } = await createTwoOrgs();
    const mk = async (bucket: string): Promise<string> =>
      (
        await asAdmin().request<{ insertFile: { id: string } }>(ADMIN_INSERT_FILE, {
          object: { bucketId: bucket, name: 'x', size: 1, mimeType: 'text/plain', isUploaded: true },
        })
      ).insertFile.id;
    const own = await mk(orgA.id);
    const foreign = await mk(orgB.id);
    await runSql(`INSERT INTO itap.file_scratch (organization_id, file_id) VALUES ('${orgA.id}', '${own}'), ('${orgA.id}', NULL);`);
    await expect(
      runSql(`INSERT INTO itap.file_scratch (organization_id, file_id) VALUES ('${orgA.id}', '${foreign}');`),
    ).rejects.toThrow(/file_not_in_org_bucket:file_id/);
    await expect(
      runSql(`INSERT INTO itap.file_scratch (organization_id, file_id) VALUES ('${orgA.id}', '${randomUUID()}');`),
    ).rejects.toThrow(/file_not_in_org_bucket:file_id/);
  });

  it('should fail loudly when a trigger argument is not a column of the table', async () => {
    const org = await createTestOrg();
    await runSql(`
      CREATE TRIGGER file_scratch_typo BEFORE INSERT ON itap.file_scratch
        FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('file_idd');
    `);
    try {
      await expect(
        runSql(`INSERT INTO itap.file_scratch (organization_id, file_id) VALUES ('${org.id}', NULL);`),
      ).rejects.toThrow(/check_file_bucket: unknown column file_idd/);
    } finally {
      await runSql('DROP TRIGGER file_scratch_typo ON itap.file_scratch;');
    }
  });
});

