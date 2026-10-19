import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin, asUser } from './support/clients.js';
import { addMember, createTestUser, expectDenied, expectError } from './support/fixtures.js';
import { ACCEPT, INVITE, invite, setup } from './support/invitations.js';
import { requireBackend } from './support/backend.js';

beforeAll(requireBackend);

describe('invite_member', () => {
  it('should create a pending invitation that stores only the token hash', async () => {
    const { org, admin } = await setup();
    const inv = await invite(admin.id, org.id, 'New.Person@itap.test');

    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const days = (new Date(inv.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const { organization_invitations: rows } = await asAdmin().request<{
      organization_invitations: { token_hash: string; status: string; role: string; invited_by: string }[];
    }>(`query ($id: uuid!) { organization_invitations(where: { id: { _eq: $id } }) { token_hash status role invited_by } }`, {
      id: inv.invitation_id,
    });
    expect(rows).toEqual([
      {
        token_hash: createHash('sha256').update(inv.token).digest('hex'),
        status: 'pending',
        role: 'admin',
        invited_by: admin.id,
      },
    ]);
  });

  it('should hide token_hash from org_admin and redact it in the audit log', async () => {
    const { org, admin } = await setup();
    const inv = await invite(admin.id, org.id, 'audit@itap.test');
    const client = asOrgAdmin(admin.id, org.id);

    await expectDenied(client.request(`query { organization_invitations { token_hash } }`), 'token_hash');
    const list = await client.request<{ organization_invitations: { id: string; email: string }[] }>(
      `query { organization_invitations { id email } }`,
    );
    expect(list.organization_invitations).toEqual([{ id: inv.invitation_id, email: 'audit@itap.test' }]);

    const { audit_log } = await client.request<{ audit_log: { changes: { token_hash: string } }[] }>(
      `query ($id: uuid!) { audit_log(where: { entity: { _eq: "organization_invitations" }, entity_id: { _eq: $id } }) { changes } }`,
      { id: inv.invitation_id },
    );
    expect(audit_log).toHaveLength(1);
    expect(audit_log[0].changes.token_hash).toBe('[redacted]');
  });

  it('should reject a second pending invitation for the same email with already_invited', async () => {
    const { org, admin } = await setup();
    await invite(admin.id, org.id, 'dup@itap.test');
    const error = await expectError(invite(admin.id, org.id, 'DUP@itap.test'));
    expect(error.code).toBe('already_invited');
  });

  it('should allow a new invitation once the previous one expired', async () => {
    const { org, admin } = await setup();
    const first = await invite(admin.id, org.id, 'again@itap.test');
    await expireInvitation(first.invitation_id);
    const second = await invite(admin.id, org.id, 'again@itap.test');
    expect(second.invitation_id).not.toBe(first.invitation_id);
  });

  it('should reject inviting an active member with already_member', async () => {
    const { org, admin, invitee } = await setup();
    await addMember(org.id, invitee.id);
    const error = await expectError(invite(admin.id, org.id, invitee.email));
    expect(error.code).toBe('already_member');
  });

  it('should allow inviting a member whose membership has expired', async () => {
    const { org, admin, invitee } = await setup();
    const { id } = await addMember(org.id, invitee.id);
    await setMemberExpiry(id, new Date(Date.now() - 60_000));
    const inv = await invite(admin.id, org.id, invitee.email);
    expect(inv.token).toBeTruthy();
  });

  it('should reject a plain user (role user) and direct inserts by org_admin', async () => {
    const { org, admin } = await setup();
    await expectDenied(asUser(admin.id).request(INVITE, { email: 'x@itap.test' }), 'invite_member');
    await expectDenied(
      asOrgAdmin(admin.id, org.id).request(
        `mutation { insert_organization_invitations_one(object: { email: "x@itap.test", token_hash: "h", expires_at: "2099-01-01T00:00:00Z", invited_by: "${admin.id}" }) { id } }`,
      ),
      'insert_organization_invitations_one',
    );
  });

  it('should let org_admin revoke a pending invitation but not edit other fields', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    const client = asOrgAdmin(admin.id, org.id);
    await expectDenied(
      client.request(
        `mutation ($id: uuid!) { update_organization_invitations_by_pk(pk_columns: { id: $id }, _set: { email: "other@itap.test" }) { id } }`,
        { id: inv.invitation_id },
      ),
      'email',
    );
    const data = await client.request<{ update_organization_invitations_by_pk: { status: string } | null }>(
      `mutation ($id: uuid!) { update_organization_invitations_by_pk(pk_columns: { id: $id }, _set: { status: revoked }) { status } }`,
      { id: inv.invitation_id },
    );
    expect(data.update_organization_invitations_by_pk).toEqual({ status: 'revoked' });

    const error = await expectError(asUser(invitee.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('invitation_not_pending');
  });
});

async function setMemberExpiry(id: string, at: Date): Promise<void> {
  await asAdmin().request(
    `mutation ($id: uuid!, $at: timestamptz!) { update_organization_members_by_pk(pk_columns: { id: $id }, _set: { expires_at: $at }) { id } }`,
    { id, at: at.toISOString() },
  );
}

async function membership(orgId: string, userId: string): Promise<{ status: string; expires_at: string | null }> {
  const { organization_members: rows } = await asAdmin().request<{
    organization_members: { status: string; expires_at: string | null }[];
  }>(
    `query ($o: uuid!, $u: uuid!) { organization_members(where: { organization_id: { _eq: $o }, user_id: { _eq: $u } }) { status expires_at } }`,
    { o: orgId, u: userId },
  );
  return rows[0];
}

async function expireInvitation(id: string): Promise<void> {
  await asAdmin().request(
    `mutation ($id: uuid!, $at: timestamptz!) { update_organization_invitations_by_pk(pk_columns: { id: $id }, _set: { expires_at: $at }) { id } }`,
    { id, at: new Date(Date.now() - 60_000).toISOString() },
  );
}

describe('accept_invitation', () => {
  it('should create an active membership for the matching user (case-insensitive email)', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email.toUpperCase());
    const data = await asUser(invitee.id).request<{ accept_invitation: { organization_id: string } }>(ACCEPT, {
      token: inv.token,
    });
    expect(data.accept_invitation.organization_id).toBe(org.id);

    const { organization_members: members } = await asAdmin().request<{
      organization_members: { status: string; role: string }[];
    }>(
      `query ($o: uuid!, $u: uuid!) { organization_members(where: { organization_id: { _eq: $o }, user_id: { _eq: $u } }) { status role } }`,
      { o: org.id, u: invitee.id },
    );
    expect(members).toEqual([{ status: 'active', role: 'admin' }]);

    const { organization_invitations: rows } = await asAdmin().request<{
      organization_invitations: { status: string; accepted_by: string; accepted_at: string }[];
    }>(`query ($id: uuid!) { organization_invitations(where: { id: { _eq: $id } }) { status accepted_by accepted_at } }`, {
      id: inv.invitation_id,
    });
    expect(rows[0].status).toBe('accepted');
    expect(rows[0].accepted_by).toBe(invitee.id);
    expect(rows[0].accepted_at).toBeTruthy();
  });

  it('should reactivate an existing deactivated membership instead of duplicating it', async () => {
    const { org, admin, invitee } = await setup();
    await addMember(org.id, invitee.id, 'deactivated');
    const inv = await invite(admin.id, org.id, invitee.email);
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });

    const { organization_members: members } = await asAdmin().request<{
      organization_members: { status: string; deactivated_at: string | null; deactivated_by: string | null }[];
    }>(
      `query ($o: uuid!, $u: uuid!) { organization_members(where: { organization_id: { _eq: $o }, user_id: { _eq: $u } }) { status deactivated_at deactivated_by } }`,
      { o: org.id, u: invitee.id },
    );
    expect(members).toEqual([{ status: 'active', deactivated_at: null, deactivated_by: null }]);
  });

  it('should renew an active membership whose expires_at has passed and clear expires_at', async () => {
    const { org, admin, invitee } = await setup();
    const { id } = await addMember(org.id, invitee.id);
    await setMemberExpiry(id, new Date(Date.now() - 60_000));
    const inv = await invite(admin.id, org.id, invitee.email);
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });
    expect(await membership(org.id, invitee.id)).toEqual({ status: 'active', expires_at: null });
  });

  it('should clear expires_at when reactivating a deactivated membership', async () => {
    const { org, admin, invitee } = await setup();
    const { id } = await addMember(org.id, invitee.id, 'deactivated');
    await setMemberExpiry(id, new Date(Date.now() + 86_400_000));
    const inv = await invite(admin.id, org.id, invitee.email);
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });
    expect(await membership(org.id, invitee.id)).toEqual({ status: 'active', expires_at: null });
  });

  it('should reject a different email with email_mismatch and leave the invitation pending', async () => {
    const { org, admin, invitee } = await setup();
    const stranger = await createTestUser();
    const inv = await invite(admin.id, org.id, invitee.email);
    const error = await expectError(asUser(stranger.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('email_mismatch');
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });
  });

  it('should reject reuse with invitation_not_pending', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    await asUser(invitee.id).request(ACCEPT, { token: inv.token });
    const error = await expectError(asUser(invitee.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('invitation_not_pending');
  });

  it('should reject an expired invitation with invitation_expired', async () => {
    const { org, admin, invitee } = await setup();
    const inv = await invite(admin.id, org.id, invitee.email);
    await expireInvitation(inv.invitation_id);
    const error = await expectError(asUser(invitee.id).request(ACCEPT, { token: inv.token }));
    expect(error.code).toBe('invitation_expired');
  });

  it('should reject an unknown token with invitation_not_found', async () => {
    const user = await createTestUser();
    const error = await expectError(asUser(user.id).request(ACCEPT, { token: 'nope-nope-nope' }));
    expect(error.code).toBe('invitation_not_found');
  });
});
