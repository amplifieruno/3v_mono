import { beforeAll, describe, expect, it } from 'vitest';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { asAdmin, asOrgAdmin, testEnv } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';

const OPEN = `mutation ($id: uuid!) { open_file(file_id: $id) { url expires_at } }`;
const DELETE = `mutation ($id: uuid!) { delete_file(file_id: $id) { file_id } }`;
const AUDIT = `
  query ($org: uuid!, $file: uuid!) {
    audit_log(where: { organization_id: { _eq: $org }, entity: { _eq: "file" }, entity_id: { _eq: $file } }) {
      action user_id
    }
  }
`;

const CONTENT = Buffer.from('sensitive itap bytes');

type FileUrl = { url: string; expires_at: string };

async function uploadSensitive(bucketId: string, kind = 'profile_document'): Promise<string> {
  const { id } = await createStorageClient(testEnv()).upload({
    bucketId,
    name: 'doc.txt',
    mimeType: 'text/plain',
    data: CONTENT,
    metadata: { kind },
  });
  return id;
}

const open = (client: ReturnType<typeof asOrgAdmin>, id: string) =>
  client.request<{ open_file: FileUrl }>(OPEN, { id });

beforeAll(requireBackend);

describe('open_file / delete_file actions', () => {
  it('should return a URL that serves the bytes and audit view_sensitive for a sensitive file', async () => {
    const { orgA, user } = await createTwoOrgs();
    const id = await uploadSensitive(orgA.id);

    const { open_file } = await open(asOrgAdmin(user.id, orgA.id), id);
    expect(new Date(open_file.expires_at).getTime()).toBeGreaterThan(Date.now() - 1000);

    const res = await fetch(open_file.url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(CONTENT)).toBe(true);

    const audit = await asAdmin().request<{ audit_log: { action: string; user_id: string }[] }>(AUDIT, {
      org: orgA.id,
      file: id,
    });
    expect(audit.audit_log).toEqual([{ action: 'view_sensitive', user_id: user.id }]);
  });

  it('should not audit opening a non-sensitive file', async () => {
    const { orgA, user } = await createTwoOrgs();
    const id = await uploadSensitive(orgA.id, 'photo');
    await open(asOrgAdmin(user.id, orgA.id), id);
    const audit = await asAdmin().request<{ audit_log: unknown[] }>(AUDIT, { org: orgA.id, file: id });
    expect(audit.audit_log).toEqual([]);
  });

  it('should answer file_not_found for another org, a missing file, and no leak either way', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const id = await uploadSensitive(orgA.id);

    const asB = asOrgAdmin(other.id, orgB.id);
    expect((await expectError(open(asB, id))).code).toBe('file_not_found');
    const missing = await expectError(open(asOrgAdmin(user.id, orgA.id), crypto.randomUUID()));
    expect(missing.code).toBe('file_not_found');
  });

  it('should delete an own file and then report file_not_found', async () => {
    const { orgA, user } = await createTwoOrgs();
    const id = await uploadSensitive(orgA.id);
    const client = asOrgAdmin(user.id, orgA.id);

    const { delete_file } = await client.request<{ delete_file: { file_id: string } }>(DELETE, { id });
    expect(delete_file.file_id).toBe(id);
    expect((await expectError(open(client, id))).code).toBe('file_not_found');
  });

  it("should not let another org delete a file, and leave it intact", async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const id = await uploadSensitive(orgA.id);

    const error = await expectError(asOrgAdmin(other.id, orgB.id).request(DELETE, { id }));
    expect(error.code).toBe('file_not_found');
    await expect(open(asOrgAdmin(user.id, orgA.id), id)).resolves.toBeDefined();
  });
});
