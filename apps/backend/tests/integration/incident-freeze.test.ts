import { describe, expect, it } from 'vitest';
import { asOrgAdmin, orgAdminToken } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { addMember, createTestUser, createTwoOrgs, PERMISSION_CHECK, expectDenied, uploadFile } from './support/fixtures.js';
import { callFn, createIncident, deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const colleague = await createTestUser();
  await addMember(orgA.id, colleague.id);
  const c = asOrgAdmin(colleague.id, orgA.id);
  return { orgA, user, a, colleague, c };
}

async function pngFile(userId: string, orgId: string): Promise<string> {
  const file = await uploadFile(orgAdminToken(userId, orgId), orgId, undefined, 'image/png');
  if (!('id' in file)) throw new Error('upload failed');
  return file.id;
}

async function eventId(orgId: string): Promise<string> {
  const [row] = await runSqlRows(
    `insert into itap.events (organization_id, event_type, title, occurred_at) values ('${orgId}', 'admin_action', 'x', now()) returning id`,
  );
  return row.id ?? '';
}

describe('closed incidents are frozen', () => {
  it('should reject updates and link/note changes on a closed incident', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const identity = await createIdentity(s.user.id, s.orgA.id);
    const link = await insertOne(s.a, 'incident_identities', { incident_id: incident.id, identity_id: identity.id });
    const eventLink = await insertOne(s.a, 'incident_events', { incident_id: incident.id, event_id: await eventId(s.orgA.id) });
    const note = await insertOne(s.a, 'incident_notes', { incident_id: incident.id, body: 'before close' });
    const noteFile = await insertOne(s.a, 'incident_note_files', { note_id: note.id, file_id: await pngFile(s.user.id, s.orgA.id) });
    await callFn(s.a, 'resolve_incident', { p_incident: incident.id, p_disposition: 'benign' }, 'id');
    // Resolved is still editable.
    expect(await updateByPk(s.a, 'incidents', incident.id, { severity: 'low' })).toEqual({ id: incident.id });
    await callFn(s.a, 'close_incident', { p_incident: incident.id }, 'id');

    expect(await updateByPk(s.a, 'incidents', incident.id, { title: 'changed' })).toBeNull();
    expect(await updateByPk(s.a, 'incidents', incident.id, { assigned_to: s.colleague.id })).toBeNull();
    await expectDenied(insertOne(s.a, 'incident_notes', { incident_id: incident.id, body: 'late' }), PERMISSION_CHECK);
    expect(await updateByPk(s.a, 'incident_notes', note.id, { body: 'edited' })).toBeNull();
    expect(await deleteByPk(s.a, 'incident_notes', note.id)).toBeNull();
    await expectDenied(
      insertOne(s.a, 'incident_identities', { incident_id: incident.id, identity_id: (await createIdentity(s.user.id, s.orgA.id)).id }),
      PERMISSION_CHECK,
    );
    expect(await deleteByPk(s.a, 'incident_identities', link.id)).toBeNull();
    await expectDenied(
      insertOne(s.a, 'incident_events', { incident_id: incident.id, event_id: await eventId(s.orgA.id) }),
      PERMISSION_CHECK,
    );
    expect(await deleteByPk(s.a, 'incident_events', eventLink.id)).toBeNull();
    await expectDenied(
      insertOne(s.a, 'incident_note_files', { note_id: note.id, file_id: await pngFile(s.user.id, s.orgA.id) }),
      PERMISSION_CHECK,
    );
    expect(await deleteByPk(s.a, 'incident_note_files', noteFile.id)).toBeNull();
  });
});

describe('note files belong to the note author', () => {
  it('should let only the author attach and remove files', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const note = await insertOne(s.a, 'incident_notes', { incident_id: incident.id, body: 'mine' });
    const file = await pngFile(s.colleague.id, s.orgA.id);
    await expectDenied(insertOne(s.c, 'incident_note_files', { note_id: note.id, file_id: file }), PERMISSION_CHECK);
    const own = await insertOne(s.a, 'incident_note_files', { note_id: note.id, file_id: file });
    expect(await deleteByPk(s.c, 'incident_note_files', own.id)).toBeNull();
    expect(await deleteByPk(s.a, 'incident_note_files', own.id)).toEqual({ id: own.id });
  });
});

describe('handover incidents belong to the sender until acknowledged', () => {
  it('should let only the sender link or unlink incidents, and only before acknowledgement', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const other = await createIncident(s.a);
    const handover = await insertOne(s.a, 'shift_handovers', {
      to_user_id: s.colleague.id,
      shift_started_at: '2026-01-05T08:00:00Z',
    });
    await expectDenied(
      insertOne(s.c, 'shift_handover_incidents', { handover_id: handover.id, incident_id: incident.id }),
      PERMISSION_CHECK,
    );
    const link = await insertOne(s.a, 'shift_handover_incidents', { handover_id: handover.id, incident_id: incident.id });
    expect(await deleteByPk(s.c, 'shift_handover_incidents', link.id)).toBeNull();
    await callFn(s.c, 'acknowledge_shift_handover', { p_handover: handover.id }, 'id');
    await expectDenied(
      insertOne(s.a, 'shift_handover_incidents', { handover_id: handover.id, incident_id: other.id }),
      PERMISSION_CHECK,
    );
    expect(await deleteByPk(s.a, 'shift_handover_incidents', link.id)).toBeNull();
  });
});
