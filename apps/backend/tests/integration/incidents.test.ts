import { describe, expect, it } from 'vitest';
import { asOrgAdmin, orgAdminToken } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createFacility } from './support/facilities.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError, uploadFile } from './support/fixtures.js';
import {
  activities,
  callFn,
  createIncident,
  deleteByPk,
  INCIDENT_FIELDS,
  insertOne,
  updateByPk,
  type Incident,
} from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

type Client = ReturnType<typeof asOrgAdmin>;
const act = (client: Client, name: string, id: string, extra: Record<string, unknown> = {}): Promise<Incident> =>
  callFn<Incident>(client, name, { p_incident: id, ...extra }, INCIDENT_FIELDS);

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  return { orgA, orgB, user, other, a };
}

describe('incident lifecycle', () => {
  it('should create INCIDENT-xxxxx open with a creation activity and walk the lifecycle with activities', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    expect(incident).toMatchObject({ status: 'open', escalation_step: 0, acknowledged_at: null });
    expect(incident.code).toMatch(/^INCIDENT-\d{5}$/);

    const acked = await act(s.a, 'acknowledge_incident', incident.id);
    expect(acked).toMatchObject({ status: 'acknowledged', acknowledged_by: s.user.id });
    expect(acked.acknowledged_at).not.toBeNull();
    // Idempotent.
    expect((await act(s.a, 'acknowledge_incident', incident.id)).acknowledged_at).toBe(acked.acknowledged_at);

    await act(s.a, 'start_investigation', incident.id);
    const resolved = await act(s.a, 'resolve_incident', incident.id, {
      p_disposition: 'false_positive',
      p_resolution: 'Badge reader glitch',
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      disposition: 'false_positive',
      resolution: 'Badge reader glitch',
      resolved_by: s.user.id,
    });
    const closed = await act(s.a, 'close_incident', incident.id);
    expect(closed.status).toBe('closed');

    const log = await activities(s.a, incident.id);
    expect(log.map((x) => [x.kind, x.details.from ?? null, x.details.to ?? null])).toEqual([
      ['status_change', null, 'open'],
      ['status_change', 'open', 'acknowledged'],
      ['status_change', 'acknowledged', 'investigating'],
      ['status_change', 'investigating', 'resolved'],
      ['status_change', 'resolved', 'closed'],
    ]);
    expect(log.slice(1).every((x) => x.actor_id === s.user.id)).toBe(true);
    expect(log[3].details).toMatchObject({ disposition: 'false_positive' });
  });

  it('should reject invalid transitions: closed is terminal, resolve needs a disposition', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const early = await expectError(act(s.a, 'close_incident', incident.id));
    expect(early.message).toContain('incident_invalid_transition');
    const noDisposition = await expectError(act(s.a, 'resolve_incident', incident.id, { p_disposition: null }));
    expect(noDisposition.message).toContain('incident_disposition_required');
    // Resolving straight from open acknowledges implicitly.
    const resolved = await act(s.a, 'resolve_incident', incident.id, { p_disposition: 'benign' });
    expect(resolved.acknowledged_by).toBe(s.user.id);
    await act(s.a, 'close_incident', incident.id);
    for (const name of ['acknowledge_incident', 'start_investigation', 'escalate_incident']) {
      const err = await expectError(act(s.a, name, incident.id));
      expect(err.message).toMatch(/incident_invalid_transition|incident_not_active/);
    }
    const reopen = await expectError(act(s.a, 'resolve_incident', incident.id, { p_disposition: 'benign' }));
    expect(reopen.message).toContain('incident_invalid_transition');
    // The trigger guards direct writes too (admin secret / SQL).
    await expect(runSql(`update itap.incidents set status = 'open' where id = '${incident.id}'`)).rejects.toThrow(
      /incident_invalid_transition/,
    );
  });

  it('should reopen a resolved incident to investigating and clear the resolution', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    await act(s.a, 'resolve_incident', incident.id, { p_disposition: 'true_positive', p_resolution: 'done' });
    const reopened = await act(s.a, 'start_investigation', incident.id);
    expect(reopened).toMatchObject({ status: 'investigating', disposition: null, resolved_at: null, resolved_by: null });
  });

  it('should escalate manually: step bump, last_escalated_at and an escalated activity', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    const once = await act(s.a, 'escalate_incident', incident.id, { p_reason: 'no response' });
    expect(once.escalation_step).toBe(1);
    expect(once.last_escalated_at).not.toBeNull();
    expect((await act(s.a, 'escalate_incident', incident.id)).escalation_step).toBe(2);
    const log = await activities(s.a, incident.id);
    expect(log.filter((x) => x.kind === 'escalated').map((x) => x.details)).toEqual([
      { step: 1, manual: true, reason: 'no response' },
      { step: 2, manual: true, reason: null },
    ]);
  });

  it('should log assignment changes and only accept active members as assignee', async () => {
    const s = await setup();
    const colleague = await createTestUser();
    await addMember(s.orgA.id, colleague.id);
    const suspended = await createTestUser();
    await addMember(s.orgA.id, suspended.id, 'suspended');
    const incident = await createIncident(s.a);
    await updateByPk(s.a, 'incidents', incident.id, { assigned_to: colleague.id });
    const log = await activities(s.a, incident.id);
    expect(log.at(-1)).toMatchObject({ kind: 'assigned', actor_id: s.user.id, details: { from: null, to: colleague.id } });
    const err = await expectError(updateByPk(s.a, 'incidents', incident.id, { assigned_to: suspended.id }));
    expect(err.message).toContain('member_not_active:assigned_to');
  });

  it('should keep status and escalation columns read-only, forbid deletes and isolate organizations', async () => {
    const s = await setup();
    const incident = await createIncident(s.a);
    await expectDenied(updateByPk(s.a, 'incidents', incident.id, { status: 'closed' }), 'status');
    await expectDenied(updateByPk(s.a, 'incidents', incident.id, { escalation_step: 3 }), 'escalation_step');
    await expectDenied(deleteByPk(s.a, 'incidents', incident.id), 'delete_incidents_by_pk');
    await expectDenied(
      s.a.request(`mutation { insert_incident_activities_one(object: {kind: "note"}) { id } }`),
      'insert_incident_activities_one',
    );
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    const err = await expectError(act(b, 'acknowledge_incident', incident.id));
    expect(err.message).toContain('incident_not_found');
    const foreign = await b.request<{ incidents: unknown[]; incident_activities: unknown[] }>(
      `query { incidents { id } incident_activities { id } }`,
    );
    expect(foreign).toEqual({ incidents: [], incident_activities: [] });
  });
});

describe('incident links and notes', () => {
  it('should link events of the organization only and identities with a role', async () => {
    const s = await setup();
    const facility = await createFacility(s.a);
    const incident = await createIncident(s.a, { facility_id: facility.id });
    const [ownEvent] = await runSqlRows(
      `insert into itap.events (organization_id, event_type, severity, facility_id, title, occurred_at)
       values ('${s.orgA.id}', 'tailgating', 'high', '${facility.id}', 'Tailgating', now()) returning id`,
    );
    const [foreignEvent] = await runSqlRows(
      `insert into itap.events (organization_id, event_type, title, occurred_at)
       values ('${s.orgB.id}', 'admin_action', 'x', now()) returning id`,
    );
    await insertOne(s.a, 'incident_events', { incident_id: incident.id, event_id: ownEvent.id });
    const err = await expectError(insertOne(s.a, 'incident_events', { incident_id: incident.id, event_id: foreignEvent.id }));
    expect(err.message).toContain('event_not_found');
    const identity = await createIdentity(s.user.id, s.orgA.id);
    const link = await insertOne<{ role: string }>(
      s.a,
      'incident_identities',
      { incident_id: incident.id, identity_id: identity.id },
      'role',
    );
    expect(link.role).toBe('subject');
  });

  it('should stamp the note author, log a note activity, attach own-bucket files and let only the author edit', async () => {
    const s = await setup();
    const colleague = await createTestUser();
    await addMember(s.orgA.id, colleague.id);
    const incident = await createIncident(s.a);
    const note = await insertOne<{ id: string; author_id: string }>(
      s.a,
      'incident_notes',
      { incident_id: incident.id, body: 'Checked the footage' },
      'id author_id',
    );
    expect(note.author_id).toBe(s.user.id);
    expect((await activities(s.a, incident.id)).at(-1)).toMatchObject({ kind: 'note', actor_id: s.user.id });
    const blank = await expectError(insertOne(s.a, 'incident_notes', { incident_id: incident.id, body: '  ' }));
    expect(blank.message).toContain('incident_notes_body_not_blank');

    const file = await uploadFile(orgAdminToken(s.user.id, s.orgA.id), s.orgA.id, undefined, 'image/png');
    if (!('id' in file)) throw new Error('upload failed');
    await insertOne(s.a, 'incident_note_files', { note_id: note.id, file_id: file.id });
    const foreign = await uploadFile(orgAdminToken(s.other.id, s.orgB.id), s.orgB.id, undefined, 'image/png');
    if (!('id' in foreign)) throw new Error('upload failed');
    const wrongBucket = await expectError(insertOne(s.a, 'incident_note_files', { note_id: note.id, file_id: foreign.id }));
    expect(wrongBucket.message).toMatch(/file/i);

    const c = asOrgAdmin(colleague.id, s.orgA.id);
    expect(await updateByPk(c, 'incident_notes', note.id, { body: 'hijacked' })).toBeNull();
    expect(await deleteByPk(c, 'incident_notes', note.id)).toBeNull();
    expect(await updateByPk(s.a, 'incident_notes', note.id, { body: 'Checked the footage twice' })).toEqual({ id: note.id });
  });
});
