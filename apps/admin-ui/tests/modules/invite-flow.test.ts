import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { HASURA_OPERATIONS } from '../../src/data/operations';
import { INVITATION_RESOURCE } from '../../src/modules/organization/invitations';

/**
 * The member invitation flows without the UI: `invite` submits the
 * `invite_member` action through the closed operations registry, `revoke`
 * withdraws a pending invitation through the table's status update.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const INVITED = {
  invitation_id: '33333333-3333-4333-8333-333333333333',
  token: 'one-time-token',
  expires_at: '2026-10-28T10:00:00.000Z',
};

beforeAll(async () => {
  await app.ready;
});

describe('invite flow', () => {
  it('should submit inviteMember with the email and the role', async () => {
    const flow = runFlow(
      app,
      { resource: INVITATION_RESOURCE, action: 'invite' },
      { user: ADMIN, mutations: { 'itap:invite-member': [answer(INVITED)] } },
    );
    await flow.fill({ email: 'new.member@itap.test', role: 'admin' }).submit();
    flow.assertOutcome('success');
    expect(flow.submitted).toHaveLength(1);
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { email: 'new.member@itap.test', role: 'admin' },
    });
  });

  it('should refuse an invalid email before submitting', async () => {
    const flow = runFlow(
      app,
      { resource: INVITATION_RESOURCE, action: 'invite' },
      { user: ADMIN, mutations: { 'itap:invite-member': [answer(INVITED)] } },
    );
    await flow.fill({ email: 'not-an-email', role: 'admin' }).submit();
    flow.assertNotSubmitted();
  });

  it('should map the action variables and its result in the registry', () => {
    const entry = HASURA_OPERATIONS[INVITATION_RESOURCE]?.inviteMember;
    expect(entry?.kind).toBe('mutation');
    expect(entry?.variables?.({ email: 'a@b.test', role: 'admin' })).toEqual({
      email: 'a@b.test',
      role: 'admin',
    });
    expect(entry?.mapResult?.({ invite_member: INVITED })).toEqual(INVITED);
  });
});

describe('revoke flow', () => {
  const pending = { id: 'i1', email: 'a@b.test', role: 'admin', status: 'pending' };

  it('should set a pending invitation to revoked', async () => {
    const flow = runFlow(
      app,
      { resource: INVITATION_RESOURCE, action: 'revoke' },
      { user: ADMIN, record: pending, rows: { [INVITATION_RESOURCE]: [pending] } },
    );
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      op: 'update',
      id: 'i1',
      input: { status: 'revoked' },
    });
  });

  it('should not offer revocation once the invitation is accepted', () => {
    const accepted = { ...pending, status: 'accepted' };
    const flow = runFlow(
      app,
      { resource: INVITATION_RESOURCE, action: 'revoke' },
      { user: ADMIN, record: accepted, rows: { [INVITATION_RESOURCE]: [accepted] } },
    );
    flow.assertUnavailable();
  });
});

describe('dashboard KPIs operation', () => {
  it('should read the first row of dashboard_kpis', () => {
    const entry = HASURA_OPERATIONS.overview?.dashboardKpis;
    expect(entry?.kind).toBe('query');
    expect(entry?.document).toContain('dashboard_kpis');
    expect(entry?.mapResult?.({ dashboard_kpis: [{ open_incidents: 2 }] })).toEqual({
      open_incidents: 2,
    });
    expect(entry?.mapResult?.({ dashboard_kpis: [] })).toBeNull();
  });
});
