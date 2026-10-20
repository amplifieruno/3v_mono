import { describe, expect, it } from 'vitest';
import { createApp } from './support/authService.js';
import { sqlHold } from './support/compliance.js';
import { createAccessPoint, createArea } from './support/facilities.js';
import { createIncident } from './support/operations.js';
import { ago, count, insertRow, purgeAll, q, retentionWorld, sqlEvent } from './support/retention.js';
import { runSqlRows } from './support/sql.js';

/** Carry from the task 2 review: attempts held through held facilities / incidents; tailgating decisions stripped. */

describe('retention: face-authentication attempts under facility and incident holds', () => {
  it('should keep attempts at access points of a held facility and attempts recorded by events of a held incident', async () => {
    const w = await retentionWorld();
    const app = await createApp(w.a);
    const door = async (facility: string) => (await createAccessPoint(w.a, facility, (await createArea(w.a, facility, 'Gate')).id)).id;
    const heldDoor = await door(w.facility.id);
    const otherDoor = await door(w.other.id);
    const attempt = (accessPoint: string | null) =>
      insertRow('authentication_attempts', {
        organization_id: q(w.org), application_id: q(app.id), attempt_no: '1', step: q('initial'), mode: q('identification'),
        outcome: q('failure'), failure_reason: q('below_threshold'), access_point_id: accessPoint ? q(accessPoint) : 'null', attempted_at: ago(400),
      });
    const atHeldDoor = await attempt(heldDoor);
    const atOtherDoor = await attempt(otherDoor);
    const ofIncident = await attempt(null);
    const free = await attempt(null);
    const incident = await createIncident(w.a, { title: 'Spoofing attempt' });
    const event = await sqlEvent(w.org, 400, { event_type: q('auth_failed'), title: q('Auth failed'), authentication_attempt_id: q(ofIncident) });
    await insertRow('incident_events', { organization_id: q(w.org), incident_id: q(incident.id), event_id: q(event) });
    await sqlHold(w.org, { facility_id: w.facility.id });
    await sqlHold(w.org, { incident_id: incident.id });

    expect(await purgeAll('auth_attempts', w.org, ago(366))).toMatchObject({ affected: 2, skipped_by_hold: 2 });
    expect(await count(`itap.authentication_attempts where id in ('${atHeldDoor}', '${ofIncident}')`)).toBe(2);
    expect(await count(`itap.authentication_attempts where id in ('${atOtherDoor}', '${free}')`)).toBe(0);
  });

  it('should strip the tailgating decision list when events are anonymized', async () => {
    const w = await retentionWorld();
    const event = await sqlEvent(w.org, 40, {
      event_type: q('tailgating'), title: q('Tailgating'),
      payload: `'{"people": 3, "granted": 1, "decisions": ["11111111-1111-4111-8111-111111111111"]}'::jsonb`,
    });
    await purgeAll('events', w.org, ago(30), { action: 'anonymize' });
    const [e] = await runSqlRows(`select payload::text as p from itap.events where id = '${event}'`);
    expect(JSON.parse(String(e.p))).toEqual({ granted: 1, anonymized: true });
  });
});
