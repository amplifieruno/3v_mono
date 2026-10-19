import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError, PERMISSION_CHECK, expectDenied } from './support/fixtures.js';
import { addCandidate, candidateState, MERGE, pgArray } from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

const INSERT_REQUEST = `mutation($o: verification_requests_insert_input!) { insert_verification_requests_one(object: $o) { id } }`;
const APPROVE = `mutation($id: uuid!) { approve_verification(args: { p_request: $id }) { id status } }`;
const REJECT = `mutation($id: uuid!) { reject_verification(args: { p_request: $id }) { id status } }`;
const UPDATE_REQUEST = `
  mutation($id: uuid!, $set: verification_requests_set_input!) {
    update_verification_requests(where: { id: { _eq: $id } }, _set: $set) { affected_rows }
  }
`;
const DELETE_REQUEST = `mutation($id: uuid!) { delete_verification_requests(where: { id: { _eq: $id } }) { affected_rows } }`;
const UPDATE_CANDIDATES = `
  mutation($set: identity_duplicate_candidates_set_input!) {
    update_identity_duplicate_candidates(where: {}, _set: $set) { affected_rows }
  }
`;

type Affected<K extends string> = Record<K, { affected_rows: number }>;

async function newRequest(userId: string, orgId: string, identityId: string): Promise<string> {
  const data = await asOrgAdmin(userId, orgId).request<{ insert_verification_requests_one: { id: string } }>(INSERT_REQUEST, {
    o: { identity_id: identityId },
  });
  return data.insert_verification_requests_one.id;
}

describe('verification request rules', () => {
  it('should let org_admin edit and delete requests only while pending', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const pending = await newRequest(user.id, orgA.id, identity.id);
    const edited = await a.request<Affected<'update_verification_requests'>>(UPDATE_REQUEST, { id: pending, set: { reason: 'x' } });
    expect(edited.update_verification_requests.affected_rows).toBe(1);

    await a.request(APPROVE, { id: pending });
    const late = await a.request<Affected<'update_verification_requests'>>(UPDATE_REQUEST, { id: pending, set: { reason: 'y' } });
    expect(late.update_verification_requests.affected_rows).toBe(0);
    const deleted = await a.request<Affected<'delete_verification_requests'>>(DELETE_REQUEST, { id: pending });
    expect(deleted.delete_verification_requests.affected_rows).toBe(0);

    const other = await createIdentity(user.id, orgA.id);
    const removable = await newRequest(user.id, orgA.id, other.id);
    const removed = await a.request<Affected<'delete_verification_requests'>>(DELETE_REQUEST, { id: removable });
    expect(removed.delete_verification_requests.affected_rows).toBe(1);
  });

  it('should refuse to verify archived or suspended identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    for (const status of ['archived', 'suspended']) {
      const identity = await createIdentity(user.id, orgA.id, { status });
      const request = await newRequest(user.id, orgA.id, identity.id);
      expect((await expectError(a.request(APPROVE, { id: request }))).message).toContain('identity_not_verifiable');
      const [row] = await runSqlRows(`select status from itap.verification_requests where id = '${request}'`);
      expect(row.status).toBe('pending');
    }
  });

  it('should refuse decisions on a merged identity up front', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const source = await createIdentity(user.id, orgA.id);
    const request = await newRequest(user.id, orgA.id, source.id);
    await a.request(MERGE, { target: target.id, sources: pgArray([source.id]) });
    // Reopen the request the merge cancelled, to reach the identity check.
    await runSql(`update itap.verification_requests set status = 'pending' where id = '${request}'`);
    expect((await expectError(a.request(APPROVE, { id: request }))).message).toContain('identity_already_merged');
    expect((await expectError(a.request(REJECT, { id: request }))).message).toContain('identity_already_merged');
  });
});

describe('duplicate candidate status rules', () => {
  it('should let org_admin set only open or dismissed, and leave merged candidates to the merge functions', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const x = await createIdentity(user.id, orgA.id);
    const y = await createIdentity(user.id, orgA.id);
    await addCandidate(orgA.id, x.id, y.id);
    await expectDenied(a.request(UPDATE_CANDIDATES, { set: { status: 'merged' } }), PERMISSION_CHECK);
    await a.request(UPDATE_CANDIDATES, { set: { status: 'dismissed' } });
    expect((await candidateState(x.id, y.id)).status).toBe('dismissed');
    await a.request(UPDATE_CANDIDATES, { set: { status: 'open' } });
    expect((await candidateState(x.id, y.id)).status).toBe('open');

    await a.request(MERGE, { target: x.id, sources: pgArray([y.id]) });
    const touched = await a.request<Affected<'update_identity_duplicate_candidates'>>(UPDATE_CANDIDATES, {
      set: { status: 'open' },
    });
    expect(touched.update_identity_duplicate_candidates.affected_rows).toBe(0);
    expect((await candidateState(x.id, y.id)).status).toBe('merged');
  });
});
