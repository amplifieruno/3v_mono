import { addMember, createTestOrg, createTestUser } from './fixtures.js';
import { asOrgAdmin } from './clients.js';

export type Invitation = { invitation_id: string; token: string; expires_at: string };

export const INVITE = `
  mutation ($email: String!, $role: String) {
    invite_member(email: $email, role: $role) { invitation_id token expires_at }
  }
`;
export const ACCEPT = `mutation ($token: String!) { accept_invitation(token: $token) { organization_id } }`;

export async function invite(adminId: string, orgId: string, email: string): Promise<Invitation> {
  const data = await asOrgAdmin(adminId, orgId).request<{ invite_member: Invitation }>(INVITE, { email });
  return data.invite_member;
}

/** An organization with one active admin, plus a user to invite. */
export async function setup() {
  const [org, admin, invitee] = await Promise.all([createTestOrg(), createTestUser(), createTestUser()]);
  await addMember(org.id, admin.id);
  return { org, admin, invitee };
}
