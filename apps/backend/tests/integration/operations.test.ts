import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { callFn, createIncident, deleteByPk, insertOne, updateByPk } from './support/operations.js';

type Handover = { id: string; from_user_id: string; to_user_id: string; acknowledged_at: string | null };
const HANDOVER_FIELDS = 'id from_user_id to_user_id acknowledged_at';

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const next = await createTestUser();
  await addMember(orgA.id, next.id);
  const n = asOrgAdmin(next.id, orgA.id);
  return { orgA, orgB, user, other, next, a, n };
}

describe('shift handovers', () => {
  it('should stamp the sender, link incidents and be acknowledged only by the recipient', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const handover = await insertOne<Handover>(
      s.a,
      'shift_handovers',
      {
        to_user_id: s.next.id,
        shift_started_at: '2026-01-05T08:00:00Z',
        shift_ended_at: '2026-01-05T16:00:00Z',
        summary: 'Quiet shift, one open incident',
        shift_handover_incidents: { data: [{ incident_id: incident.id }] },
      },
      HANDOVER_FIELDS,
    );
    expect(handover).toMatchObject({ from_user_id: s.user.id, to_user_id: s.next.id, acknowledged_at: null });
    const notRecipient = await expectError(callFn(s.a, 'acknowledge_shift_handover', { p_handover: handover.id }, 'id'));
    expect(notRecipient.message).toContain('handover_not_recipient');
    const acked = await callFn<Handover>(s.n, 'acknowledge_shift_handover', { p_handover: handover.id }, HANDOVER_FIELDS);
    expect(acked.acknowledged_at).not.toBeNull();
    // Acknowledged handovers are frozen for the sender.
    expect(await updateByPk(s.a, 'shift_handovers', handover.id, { summary: 'changed' })).toBeNull();
    await expectDenied(updateByPk(s.a, 'shift_handovers', handover.id, { acknowledged_at: null }), 'acknowledged_at');
  });

  it('should reject a handover to oneself, to an inactive member and with an inverted shift', async () => {
    const s = await setup();
    const self = await expectError(insertOne(s.a, 'shift_handovers', { to_user_id: s.user.id, shift_started_at: '2026-01-05T08:00:00Z' }));
    expect(self.message).toContain('shift_handovers_distinct_users');
    const gone = await createTestUser();
    await addMember(s.orgA.id, gone.id, 'suspended');
    const inactive = await expectError(insertOne(s.a, 'shift_handovers', { to_user_id: gone.id, shift_started_at: '2026-01-05T08:00:00Z' }));
    expect(inactive.message).toContain('member_not_active:to_user_id');
    const inverted = await expectError(
      insertOne(s.a, 'shift_handovers', {
        to_user_id: s.next.id,
        shift_started_at: '2026-01-05T16:00:00Z',
        shift_ended_at: '2026-01-05T08:00:00Z',
      }),
    );
    expect(inverted.message).toContain('shift_handovers_times_ordered');
  });
});

describe('operator workspaces', () => {
  it('should belong to the session user: others in the organization neither see nor change them', async () => {
    const s = await setup();
    const ws = await insertOne<{ id: string; user_id: string; is_default: boolean }>(
      s.a,
      'operator_workspaces',
      { name: 'Lobby wall', layout: { panels: [{ kind: 'camera', w: 2, h: 1 }] }, is_default: true },
      'id user_id is_default',
    );
    expect(ws).toMatchObject({ user_id: s.user.id, is_default: true });
    const theirs = await s.n.request<{ operator_workspaces: unknown[] }>(`query { operator_workspaces { id } }`);
    expect(theirs.operator_workspaces).toEqual([]);
    expect(await updateByPk(s.n, 'operator_workspaces', ws.id, { name: 'mine now' })).toBeNull();
    expect(await deleteByPk(s.n, 'operator_workspaces', ws.id)).toBeNull();
    await expectDenied(
      s.n.request(`mutation($u: uuid!) { insert_operator_workspaces_one(object: {name: "x", user_id: $u}) { id } }`, {
        u: s.user.id,
      }),
      'user_id',
    );
    // One default per user: a new default takes it from the previous one (migration 277), never two.
    const second = await insertOne<{ id: string; is_default: boolean }>(
      s.a,
      'operator_workspaces',
      { name: 'Floor 2', is_default: true },
      'id is_default',
    );
    expect(second.is_default).toBe(true);
    const mine = await s.a.request<{ operator_workspaces: { id: string; is_default: boolean }[] }>(
      `query { operator_workspaces(order_by: {name: asc}) { id is_default } }`,
    );
    expect(mine.operator_workspaces).toEqual([
      { id: second.id, is_default: true },
      { id: ws.id, is_default: false },
    ]);
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    expect((await b.request<{ operator_workspaces: unknown[] }>(`query { operator_workspaces { id } }`)).operator_workspaces).toEqual([]);
  });
});
