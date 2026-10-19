import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { addEmbedding, axis, createIdentity } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { identityState, MERGE, type MergeRow, newProfile, pgArray, ROLLBACK, UPDATE_IDENTITY } from './support/lifecycle.js';
import { runSql } from './support/sql.js';

beforeAll(requireBackend);

const INSERT_REQUEST = `
  mutation($o: verification_requests_insert_input!) { insert_verification_requests_one(object: $o) { id } }
`;
const DELETE_REQUEST = `mutation($id: uuid!) { delete_verification_requests_by_pk(id: $id) { id } }`;
const APPROVE = `mutation($id: uuid!) { approve_verification(args: { p_request: $id }) { id } }`;
const REJECT = `mutation($id: uuid!) { reject_verification(args: { p_request: $id }) { id } }`;
const UPLOAD = `
  mutation($p: uuid!) {
    upload_profile_document(profile_id: $p, kind: "nda", title: "NDA", file_name: "nda.pdf",
      mime_type: "application/pdf", content_base64: "JVBERi0xLjQ=") { document_id }
  }
`;

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  return { orgA, user, a };
}

describe('identity status rules for org_admin', () => {
  it('should allow unverified, suspended and archived but reserve verified and pending_verification', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id);
    for (const status of ['suspended', 'archived', 'unverified']) {
      await a.request(UPDATE_IDENTITY, { id: identity.id, set: { status } });
      expect((await identityState(identity.id)).status).toBe(status);
    }
    for (const status of ['verified', 'pending_verification']) {
      const error = await expectError(a.request(UPDATE_IDENTITY, { id: identity.id, set: { status } }));
      expect(error.message).toContain(`identity_status_reserved:${status}`);
      const inserted = await expectError(createIdentity(user.id, orgA.id, { status }));
      expect(inserted.message).toContain(`identity_status_reserved:${status}`);
    }
    expect((await identityState(identity.id)).status).toBe('unverified');
  });

  it('should still let org_admin edit other columns of a verified identity', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id);
    await runSql(`update itap.identities set status = 'verified' where id = '${identity.id}'`);
    await a.request(UPDATE_IDENTITY, { id: identity.id, set: { attributes: { note: 'vip' } } });
    expect((await identityState(identity.id)).status).toBe('verified');
  });

  it('should make is_synthetic insert-only', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id, { is_synthetic: true });
    await expectDenied(a.request(UPDATE_IDENTITY, { id: identity.id, set: { is_synthetic: false } }), 'is_synthetic');
  });
});

describe('verification requests drive pending_verification', () => {
  it('should set pending_verification on request and return to unverified on reject', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id);
    const { insert_verification_requests_one: request } = await a.request<{ insert_verification_requests_one: { id: string } }>(
      INSERT_REQUEST,
      { o: { identity_id: identity.id } },
    );
    expect((await identityState(identity.id)).status).toBe('pending_verification');
    await a.request(REJECT, { id: request.id });
    expect((await identityState(identity.id)).status).toBe('unverified');
  });

  it('should return to unverified when the pending request is deleted, and verify on approve', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id);
    const insert = () =>
      a.request<{ insert_verification_requests_one: { id: string } }>(INSERT_REQUEST, { o: { identity_id: identity.id } });
    const first = (await insert()).insert_verification_requests_one;
    await a.request(DELETE_REQUEST, { id: first.id });
    expect((await identityState(identity.id)).status).toBe('unverified');
    const second = (await insert()).insert_verification_requests_one;
    await a.request(APPROVE, { id: second.id });
    expect((await identityState(identity.id)).status).toBe('verified');
  });

  it('should leave a suspended identity suspended when a request is created', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id, { status: 'suspended' });
    await a.request(INSERT_REQUEST, { o: { identity_id: identity.id } });
    expect((await identityState(identity.id)).status).toBe('suspended');
  });

  it('should restore a merged pending source as unverified on rollback (its request stays cancelled)', async () => {
    const { orgA, user, a } = await setup();
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    await addEmbedding(orgA.id, source.id, axis(3), 0.9);
    await a.request(INSERT_REQUEST, { o: { identity_id: source.id } });
    const { merge_identities: [merge] } = await a.request<{ merge_identities: MergeRow[] }>(MERGE, {
      target: target.id,
      sources: pgArray([source.id]),
    });
    await a.request(ROLLBACK, { id: merge.id });
    expect((await identityState(source.id)).status).toBe('unverified');
  });
});

describe('lifecycle tables are not hard-deletable by org_admin', () => {
  it('should not expose delete for profiles, identities and profile_documents', async () => {
    const { orgA, user, a } = await setup();
    const profile = await newProfile(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const { upload_profile_document: doc } = await a.request<{ upload_profile_document: { document_id: string } }>(UPLOAD, {
      p: profile,
    });
    await expectDenied(a.request(`mutation($id: uuid!) { delete_profiles_by_pk(id: $id) { id } }`, { id: profile }), 'delete_profiles_by_pk');
    await expectDenied(
      a.request(`mutation($id: uuid!) { delete_identities_by_pk(id: $id) { id } }`, { id: identity.id }),
      'delete_identities_by_pk',
    );
    await expectDenied(
      a.request(`mutation($id: uuid!) { delete_profile_documents_by_pk(id: $id) { id } }`, { id: doc.document_id }),
      'delete_profile_documents_by_pk',
    );
  });

  it('should keep embeddings deletable', async () => {
    const { orgA, user, a } = await setup();
    const identity = await createIdentity(user.id, orgA.id);
    const embedding = await addEmbedding(orgA.id, identity.id, axis(4), 0.9);
    const data = await a.request<{ delete_identity_embeddings_by_pk: { id: string } | null }>(
      `mutation($id: uuid!) { delete_identity_embeddings_by_pk(id: $id) { id } }`,
      { id: embedding },
    );
    expect(data.delete_identity_embeddings_by_pk?.id).toBe(embedding);
  });
});
