import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';

type Affected = { update_organization_members: { affected_rows: number } };
type Member = { status: string; deactivated_at: string | null; deactivated_by: string | null };

const SET_DELEGATE = `
  mutation SetDelegate($userId: uuid!, $delegate: uuid!) {
    update_organization_members(where: { user_id: { _eq: $userId } }, _set: { vacation_delegate_user_id: $delegate }) {
      affected_rows
    }
  }
`;

const SET_STATUS = `
  mutation SetStatus($userId: uuid!, $status: member_statuses_enum!) {
    update_organization_members(where: { user_id: { _eq: $userId } }, _set: { status: $status }) {
      returning { status deactivated_at deactivated_by }
    }
  }
`;

describe('organization members', () => {
  it('should reject a vacation delegate who is a member of another organization only', async () => {
    const { orgA, user, other } = await createTwoOrgs();
    const error = await expectError(
      asOrgAdmin(user.id, orgA.id).request(SET_DELEGATE, { userId: user.id, delegate: other.id }),
    );
    expect(error.message).toContain('organization_members_vacation_delegate_user_id_fkey');
  });

  it('should reject a vacation delegate who is a deactivated member', async () => {
    const { orgA, user } = await createTwoOrgs();
    const gone = await createTestUser();
    await addMember(orgA.id, gone.id, 'deactivated');
    const error = await expectError(
      asOrgAdmin(user.id, orgA.id).request(SET_DELEGATE, { userId: user.id, delegate: gone.id }),
    );
    expect(error.message).toContain('member_not_active:vacation_delegate_user_id');
  });

  it('should accept an active member of the same organization as vacation delegate', async () => {
    const { orgA, user } = await createTwoOrgs();
    const colleague = await createTestUser();
    await addMember(orgA.id, colleague.id);
    const data = await asOrgAdmin(user.id, orgA.id).request<Affected>(SET_DELEGATE, {
      userId: user.id,
      delegate: colleague.id,
    });
    expect(data.update_organization_members.affected_rows).toBe(1);
  });

  it('should let org_admin deactivate and reactivate a member with bookkeeping set by trigger', async () => {
    const { orgA, user } = await createTwoOrgs();
    const member = await createTestUser();
    await addMember(orgA.id, member.id);
    const client = asOrgAdmin(user.id, orgA.id);

    const deactivated = await client.request<{ update_organization_members: { returning: Member[] } }>(SET_STATUS, {
      userId: member.id,
      status: 'deactivated',
    });
    const [row] = deactivated.update_organization_members.returning;
    expect(row.status).toBe('deactivated');
    expect(row.deactivated_at).not.toBeNull();
    expect(row.deactivated_by).toBe(user.id);

    const error = await expectError(client.request(SET_DELEGATE, { userId: user.id, delegate: member.id }));
    expect(error.message).toContain('member_not_active:vacation_delegate_user_id');

    const reactivated = await client.request<{ update_organization_members: { returning: Member[] } }>(SET_STATUS, {
      userId: member.id,
      status: 'active',
    });
    expect(reactivated.update_organization_members.returning).toEqual([
      { status: 'active', deactivated_at: null, deactivated_by: null },
    ]);
  });

  it('should not let org_admin update members of another organization', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const data = await asOrgAdmin(user.id, orgA.id).request<Affected>(
      `mutation ($org: uuid!) {
        update_organization_members(where: { organization_id: { _eq: $org } }, _set: { title: "Hijacked" }) {
          affected_rows
        }
      }`,
      { org: orgB.id },
    );
    expect(data.update_organization_members.affected_rows).toBe(0);
  });

  it('should not let org_admin change a member user_id after insert', async () => {
    const { orgA, user } = await createTwoOrgs();
    const stranger = await createTestUser();
    const error = await expectDenied(
      asOrgAdmin(user.id, orgA.id).request(
        `mutation ($u: uuid!, $s: uuid!) {
          update_organization_members(where: { user_id: { _eq: $u } }, _set: { user_id: $s }) { affected_rows }
        }`,
        { u: user.id, s: stranger.id },
      ),
    );
    expect(error.message).toContain("field 'user_id' not found in type: 'organization_members_set_input'");
  });
});
