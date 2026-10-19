import { describe, expect, it } from 'vitest';
import { asOrgAdmin, asUser, orgAdminToken } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError, PERMISSION_CHECK, uploadFile } from './support/fixtures.js';

const FILE_NO_META = `query F($id: uuid!) { file(id: $id) { id bucketId } }`;
const ADMIN_INSERT_FILE = `mutation I($object: files_insert_input!) { insertFile(object: $object) { id } }`;
const SET_LOGO = `
  mutation SetLogo($id: uuid!, $file: uuid!) {
    update_organizations_by_pk(pk_columns: { id: $id }, _set: { logo_file_id: $file }) { logo_file_id }
  }
`;

async function upload(token: string, bucketId: string, mimeType: string): Promise<string> {
  const result = await uploadFile(token, bucketId, undefined, mimeType);
  if (!('id' in result)) throw new Error(`expected the upload to succeed, got status ${result.status}`);
  return result.id;
}

describe('shared org-logos bucket', () => {
  it('should let an org admin upload an image and a plain user select it', async () => {
    const { orgA, user } = await createTwoOrgs();
    const id = await upload(orgAdminToken(user.id, orgA.id), 'org-logos', 'image/png');
    const asU = await asUser(user.id).request<{ file: { id: string } | null }>(FILE_NO_META, { id });
    expect(asU.file?.id).toBe(id);
  });

  it('should reject a non-image upload to org-logos', async () => {
    const { orgA, user } = await createTwoOrgs();
    expect(await uploadFile(orgAdminToken(user.id, orgA.id), 'org-logos', undefined, 'text/plain')).toEqual({
      status: 403,
    });
  });

  it.each(['image/svg+xml', 'image/gif', 'image/svg'])(
    'should reject a %s upload to org-logos (raster png/jpeg/webp only)',
    async (mimeType) => {
      const { orgA, user } = await createTwoOrgs();
      expect(await uploadFile(orgAdminToken(user.id, orgA.id), 'org-logos', undefined, mimeType)).toEqual({
        status: 403,
      });
    },
  );

  it.each(['image/png', 'image/jpeg', 'image/webp'])('should accept a %s upload to org-logos', async (mimeType) => {
    const { orgA, user } = await createTwoOrgs();
    const id = await upload(orgAdminToken(user.id, orgA.id), 'org-logos', mimeType);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(['profile_document', 'dsr_export', 'auth_capture'])(
    'should reject a direct %s insert into org-logos by an org admin',
    async (kind) => {
      const { orgA, user } = await createTwoOrgs();
      await expectDenied(
        asOrgAdmin(user.id, orgA.id).request(ADMIN_INSERT_FILE, {
          object: { bucketId: 'org-logos', name: 'test-logo.png', size: 1, mimeType: 'image/png', metadata: { kind } },
        }),
        PERMISSION_CHECK,
      );
    },
  );

  it('should accept only an org-logos file as organizations.logo_file_id', async () => {
    const { orgA, user } = await createTwoOrgs();
    const token = orgAdminToken(user.id, orgA.id);
    const client = asOrgAdmin(user.id, orgA.id);

    const ownBucketFile = await upload(token, orgA.id, 'image/png');
    const error = await expectError(client.request(SET_LOGO, { id: orgA.id, file: ownBucketFile }));
    expect(error.message).toContain('file_not_in_org_logos:logo_file_id');

    const logo = await upload(token, 'org-logos', 'image/png');
    const ok = await client.request<{ update_organizations_by_pk: { logo_file_id: string } }>(SET_LOGO, {
      id: orgA.id,
      file: logo,
    });
    expect(ok.update_organizations_by_pk.logo_file_id).toBe(logo);
  });
});
