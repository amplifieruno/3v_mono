import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs } from './support/fixtures.js';
import { createIncident, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

/**
 * The console's "me" computed fields (migrations 276/277, session user via itap.session_user_id since 278):
 * incidents.assigned_to_me and shift_handovers.addressed_to_me / sent_by_me answer for the session user only;
 * an upper-case user id still matches, a session without a valid user id matches nothing.
 */

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const peer = await createTestUser();
  await addMember(orgA.id, peer.id);
  return { orgA, user, peer, a: asOrgAdmin(user.id, orgA.id), p: asOrgAdmin(peer.id, orgA.id) };
}

describe('console "me" computed fields', () => {
  it('should say whether an incident is assigned to the session user', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    await updateByPk(s.a, 'incidents', incident.id, { assigned_to: s.user.id });
    const mine = async (client: typeof s.a) =>
      (
        await client.request<{ incidents_by_pk: { assigned_to_me: boolean } }>(
          'query($id: uuid!) { incidents_by_pk(id: $id) { assigned_to_me } }',
          { id: incident.id },
        )
      ).incidents_by_pk.assigned_to_me;
    expect(await mine(s.a)).toBe(true);
    expect(await mine(s.p)).toBe(false);

    const rows = await runSqlRows(`
      SELECT itap.incident_assigned_to_me(i, json_build_object('x-hasura-user-id', upper('${s.user.id}'))) AS upper_id,
             itap.incident_assigned_to_me(i, json_build_object('x-hasura-user-id', 'not-a-uuid')) AS garbage,
             itap.incident_assigned_to_me(i, '{}'::json) AS no_user
      FROM itap.incidents i WHERE i.id = '${incident.id}'`);
    expect(rows).toEqual([{ upper_id: 't', garbage: 'f', no_user: 'f' }]);
  });

  it('should say whether a handover is addressed to or sent by the session user', async () => {
    const s = await setup();
    const handover = await insertOne(s.a, 'shift_handovers', {
      to_user_id: s.peer.id,
      shift_started_at: '2026-01-05T08:00:00Z',
      shift_ended_at: '2026-01-05T16:00:00Z',
      summary: 'Quiet shift',
    });
    const flags = async (client: typeof s.a) =>
      (
        await client.request<{ shift_handovers_by_pk: { addressed_to_me: boolean; sent_by_me: boolean } }>(
          'query($id: uuid!) { shift_handovers_by_pk(id: $id) { addressed_to_me sent_by_me } }',
          { id: handover.id },
        )
      ).shift_handovers_by_pk;
    expect(await flags(s.a)).toEqual({ addressed_to_me: false, sent_by_me: true });
    expect(await flags(s.p)).toEqual({ addressed_to_me: true, sent_by_me: false });

    const rows = await runSqlRows(`
      SELECT itap.shift_handover_addressed_to_me(h, json_build_object('x-hasura-user-id', upper('${s.peer.id}'))) AS to_upper,
             itap.shift_handover_sent_by_me(h, json_build_object('x-hasura-user-id', upper('${s.user.id}'))) AS from_upper,
             itap.shift_handover_sent_by_me(h, '{}'::json) AS no_user
      FROM itap.shift_handovers h WHERE h.id = '${handover.id}'`);
    expect(rows).toEqual([{ to_upper: 't', from_upper: 't', no_user: 'f' }]);
  });
});
