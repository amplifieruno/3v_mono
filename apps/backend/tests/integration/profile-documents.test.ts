import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { newProfile } from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

const UPLOAD = `
  mutation($p: uuid!, $k: String!, $t: String!, $n: String!, $m: String!, $c: String!) {
    upload_profile_document(profile_id: $p, kind: $k, title: $t, file_name: $n, mime_type: $m, content_base64: $c) {
      document_id file_id
    }
  }
`;
const OPEN = `mutation($id: uuid!) { open_file(file_id: $id) { url } }`;
const FILE_BY_ID = `query($id: uuid!) { file(id: $id) { id } }`;
const DOCS = `
  query($p: uuid!) { profile_documents(where: { profile_id: { _eq: $p } }) { id kind title version file_id } }
`;
const AUDIT = `
  query($org: uuid!, $file: uuid!) {
    audit_log(where: { organization_id: { _eq: $org }, entity: { _eq: "files" }, entity_id: { _eq: $file } }) {
      action user_id
    }
  }
`;

const CONTENT = Buffer.from('%PDF-1.4 fake contract');

function vars(profile: string, overrides: Record<string, unknown> = {}) {
  return {
    p: profile,
    k: 'contract',
    t: 'Contract 2026',
    n: 'contract.pdf',
    m: 'application/pdf',
    c: CONTENT.toString('base64'),
    ...overrides,
  };
}

beforeAll(requireBackend);

describe('upload_profile_document', () => {
  it('should store a file org_admin cannot select directly but can open via open_file (audited)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);

    const { upload_profile_document: result } = await a.request<{
      upload_profile_document: { document_id: string; file_id: string };
    }>(UPLOAD, vars(profile));
    expect(result.document_id).toMatch(/^[0-9a-f-]{36}$/);

    const docs = await a.request<{ profile_documents: { id: string; kind: string; title: string; version: number; file_id: string }[] }>(
      DOCS,
      { p: profile },
    );
    expect(docs.profile_documents).toEqual([
      { id: result.document_id, kind: 'contract', title: 'Contract 2026', version: 1, file_id: result.file_id },
    ]);

    // Sensitive kind: hidden from direct selects ...
    expect((await a.request<{ file: unknown }>(FILE_BY_ID, { id: result.file_id })).file).toBeNull();
    // ... but opened through open_file, which audits the access.
    const { open_file } = await a.request<{ open_file: { url: string } }>(OPEN, { id: result.file_id });
    const res = await fetch(open_file.url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(CONTENT)).toBe(true);
    const audit = await asAdmin().request<{ audit_log: { action: string; user_id: string }[] }>(AUDIT, {
      org: orgA.id,
      file: result.file_id,
    });
    expect(audit.audit_log).toEqual([{ action: 'view_sensitive', user_id: user.id }]);

    const rows = await runSqlRows(
      `select action, user_id::text from itap.audit_log where entity = 'profile_documents' and entity_id = '${result.document_id}'`,
    );
    expect(rows).toEqual([{ action: 'insert', user_id: user.id }]);
    const [file] = await runSqlRows(`select bucket_id from storage.files where id = '${result.file_id}'`);
    expect(file.bucket_id).toBe(orgA.id);
  });

  it('should answer profile_not_found for a profile of another organization or a random id', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const foreign = await newProfile(other.id, orgB.id);
    const a = asOrgAdmin(user.id, orgA.id);
    for (const id of [foreign, '00000000-0000-4000-8000-000000000000']) {
      const error = await expectError(a.request(UPLOAD, vars(id)));
      expect(error.message).toContain('Profile not found');
      expect(error.code).toBe('profile_not_found');
    }
    expect((await asOrgAdmin(other.id, orgB.id).request<{ profile_documents: unknown[] }>(DOCS, { p: foreign })).profile_documents).toEqual([]);
  });

  it('should answer file_too_large above 10 MB decoded', async () => {
    const { orgA, user } = await createTwoOrgs();
    const profile = await newProfile(user.id, orgA.id);
    const big = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    const error = await expectError(asOrgAdmin(user.id, orgA.id).request(UPLOAD, vars(profile, { c: big })));
    expect(error.code).toBe('file_too_large');
  });

  it('should accept a document just under the limit', async () => {
    const { orgA, user } = await createTwoOrgs();
    const profile = await newProfile(user.id, orgA.id);
    const big = Buffer.alloc(9 * 1024 * 1024).toString('base64');
    const data = await asOrgAdmin(user.id, orgA.id).request<{ upload_profile_document: { file_id: string } }>(
      UPLOAD,
      vars(profile, { c: big }),
    );
    expect(data.upload_profile_document.file_id).toBeTruthy();
  });

  it('should reject an unknown kind and delete the profile documents with the profile', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);
    const error = await expectError(a.request(UPLOAD, vars(profile, { k: 'selfie' })));
    expect(error.code).toBe('invalid_input');

    await a.request(UPLOAD, vars(profile));
    await a.request(`mutation($id: uuid!) { delete_profiles_by_pk(id: $id) { id } }`, { id: profile });
    const rows = await runSqlRows(`select count(*)::text as n from itap.profile_documents where profile_id = '${profile}'`);
    expect(rows[0].n).toBe('0');
  });

  it('should move documents to the target profile on merge_profiles', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await newProfile(user.id, orgA.id);
    const source = await newProfile(user.id, orgA.id);
    const { upload_profile_document: doc } = await a.request<{ upload_profile_document: { document_id: string } }>(
      UPLOAD,
      vars(source),
    );
    await a.request(`mutation($t: uuid!, $s: uuid!) { merge_profiles(args: { p_target: $t, p_source: $s }) { id } }`, {
      t: target,
      s: source,
    });
    const docs = await a.request<{ profile_documents: { id: string }[] }>(DOCS, { p: target });
    expect(docs.profile_documents.map((d) => d.id)).toEqual([doc.document_id]);
  });
});
