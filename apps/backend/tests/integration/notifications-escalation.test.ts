import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import {
  escalate,
  escalationDeliveries,
  escalationIncident,
  escalationPolicy,
  incidentState,
  minutes,
  onCallSchedule,
  T0,
  trail,
} from './support/escalation.js';
import { member, orgInbox, recipientGroup, setMember } from './support/notifications.js';
import { activities, callFn, INCIDENT_FIELDS } from './support/operations.js';
import { cronPayload, postTrigger, waitFor } from './support/sending.js';
import { createTrackingWorld } from './support/tracking.js';

async function world() {
  const w = await createTrackingWorld();
  const [bob, carol, dave] = await Promise.all([member(w.orgA.id), member(w.orgA.id), member(w.orgA.id)]);
  return { ...w, bob, carol, dave };
}

describe('escalate: step by step (Review Focus 3)', () => {
  it('should escalate each step at its after_minutes since the previous one and stop once acknowledged', async () => {
    const w = await world();
    const first = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const third = await recipientGroup(w.a, [{ user_id: w.dave, channel: 'email' }, { external_address: 'noc@example.com', channel: 'email' }]);
    const schedule = await onCallSchedule(w.a, [w.carol]);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 5, channel: 'in_app', recipient_group_id: first },
      { after_minutes: 10, channel: 'email', on_call_schedule_id: schedule },
      { after_minutes: 15, channel: 'email', recipient_group_id: third },
    ]);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id);
    const [s1, s2, s3] = p.steps;

    expect(await escalate(w.orgA.id, minutes(4.99))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(5))).toMatchObject([{ id: incident, escalation_step: 1 }]);
    // The same scheduled time again (a cron retry) escalates nothing more.
    expect(await escalate(w.orgA.id, minutes(5))).toEqual([]);
    let state = await incidentState(incident);
    expect(state).toMatchObject({ escalation_step: 1, status: 'open' });
    expect(Date.parse(state.last_escalated_at ?? '')).toBe(Date.parse(minutes(5)));
    expect(trail(await escalationDeliveries(w.orgA.id, incident))).toEqual([[s1, 0, w.bob]]);
    const [inbox] = await orgInbox(w.orgA.id);
    expect(inbox).toMatchObject({ user_id: w.bob, incident_id: incident, priority: 'critical' });
    expect(inbox.title).toMatch(/INCIDENT-\d{5}/);

    // Step 2 is due 10 minutes after step 1 (not after the incident).
    expect(await escalate(w.orgA.id, minutes(14.99))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(15))).toMatchObject([{ escalation_step: 2 }]);
    const deliveries = await escalationDeliveries(w.orgA.id, incident);
    expect(trail(deliveries)).toEqual([[s1, 0, w.bob], [s2, 0, w.carol]]);
    expect(deliveries[1]).toMatchObject({ channel: 'email', priority: 'critical', deliver_after: null });

    await callFn(w.a, 'acknowledge_incident', { p_incident: incident }, INCIDENT_FIELDS);
    expect(await escalate(w.orgA.id, minutes(30))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(600))).toEqual([]);
    state = await incidentState(incident);
    expect(state).toMatchObject({ escalation_step: 2, status: 'acknowledged' });
    expect(trail(await escalationDeliveries(w.orgA.id, incident)).map((x) => x[0])).not.toContain(s3);

    const log = (await activities(w.a, incident)).filter((x) => x.kind === 'escalated');
    expect(log.map((x) => x.details)).toEqual([
      expect.objectContaining({ step: 1, step_no: 10, cycle: 0, step_id: s1, channel: 'in_app', recipients: 1, manual: false }),
      expect.objectContaining({ step: 2, step_no: 20, cycle: 0, step_id: s2, channel: 'email', recipients: 1, manual: false }),
    ]);
  });

  it('should walk all steps once without repeat, and cycle again with repeat', async () => {
    const w = await world();
    const g1 = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const g2 = await recipientGroup(w.a, [{ user_id: w.carol, channel: 'in_app' }]);
    const steps = [
      { after_minutes: 1, channel: 'in_app', recipient_group_id: g1 },
      { after_minutes: 2, channel: 'in_app', recipient_group_id: g2 },
    ];
    const once = await escalationPolicy(w.a, steps);
    const looping = await escalationPolicy(w.a, steps, true);
    const a = await escalationIncident(w.a, w.orgA.id, once.id);
    const b = await escalationIncident(w.a, w.orgA.id, looping.id);
    for (const m of [1, 3, 4, 6, 7, 60, 120]) await escalate(w.orgA.id, minutes(m));

    expect(trail(await escalationDeliveries(w.orgA.id, a))).toEqual([[once.steps[0], 0, w.bob], [once.steps[1], 0, w.carol]]);
    expect((await incidentState(a)).escalation_step).toBe(2);
    // Repeat: 1 (c0 s1), 3 (c0 s2), 4 (c1 s1), 6 (c1 s2), 7 (c2 s1), 60 (c2 s2), 120 (c3 s1).
    expect(trail(await escalationDeliveries(w.orgA.id, b))).toEqual([
      [looping.steps[0], 0, w.bob], [looping.steps[1], 0, w.carol],
      [looping.steps[0], 1, w.bob], [looping.steps[1], 1, w.carol],
      [looping.steps[0], 2, w.bob], [looping.steps[1], 2, w.carol],
      [looping.steps[0], 3, w.bob],
    ]);
    expect((await incidentState(b)).escalation_step).toBe(7);
    // Every cycle notifies again: one inbox row per delivery.
    expect((await orgInbox(w.orgA.id)).filter((n) => n.incident_id === b)).toHaveLength(7);
  });

  it('should skip resolved, investigating and policy-less incidents and other organizations', async () => {
    const w = await world();
    const g = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const p = await escalationPolicy(w.a, [{ after_minutes: 0, channel: 'in_app', recipient_group_id: g }]);
    const resolved = await escalationIncident(w.a, w.orgA.id, p.id);
    const investigating = await escalationIncident(w.a, w.orgA.id, p.id);
    await escalationIncident(w.a, w.orgA.id, null);
    const open = await escalationIncident(w.a, w.orgA.id, p.id);
    await callFn(w.a, 'resolve_incident', { p_incident: resolved, p_disposition: 'benign' }, INCIDENT_FIELDS);
    await callFn(w.a, 'start_investigation', { p_incident: investigating }, INCIDENT_FIELDS);
    expect(await escalate(w.orgB.id, minutes(10))).toEqual([]);
    expect((await escalate(w.orgA.id, minutes(10))).map((x) => x.id)).toEqual([open]);
    expect((await escalationDeliveries(w.orgA.id)).map((d) => d.incident_id)).toEqual([open]);
  });

  it('should escalate an old never-escalated incident one step per run, then time the next step from now', async () => {
    const w = await world();
    const g = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 5, channel: 'in_app', recipient_group_id: g },
      { after_minutes: 10, channel: 'in_app', recipient_group_id: g },
      { after_minutes: 15, channel: 'in_app', recipient_group_id: g },
    ]);
    const old = await escalationIncident(w.a, w.orgA.id, p.id, minutes(-10 * 24 * 60));
    expect(await escalate(w.orgA.id, T0)).toMatchObject([{ id: old, escalation_step: 1 }]);
    expect(await escalate(w.orgA.id, minutes(1))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(9.99))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(10))).toMatchObject([{ escalation_step: 2 }]);
    expect((await escalationDeliveries(w.orgA.id, old)).map((d) => d.escalation_step_id)).toEqual(p.steps.slice(0, 2));
  });
});

describe('escalate: recipients', () => {
  it('should notify the member on call at the escalation time, through their vacation delegate', async () => {
    const w = await world();
    // Shifts of 1 hour from T0: bob 08-09, carol 09-10, bob 10-11 ...
    const schedule = await onCallSchedule(w.a, [w.bob, w.carol]);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 70, channel: 'in_app', on_call_schedule_id: schedule },
      { after_minutes: 60, channel: 'in_app', on_call_schedule_id: schedule },
    ], true);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id);
    await escalate(w.orgA.id, minutes(70)); // 09:10 -> carol
    await setMember(w.orgA.id, w.bob, `vacation_until = '${minutes(24 * 60)}', vacation_delegate_user_id = '${w.dave}'`);
    await escalate(w.orgA.id, minutes(130)); // 10:10 -> bob, on vacation -> dave
    expect(trail(await escalationDeliveries(w.orgA.id, incident)).map((x) => x[2])).toEqual([w.carol, w.dave]);
  });

  it('should skip inactive group members, use external addresses of the step channel and defer non-critical email in quiet hours', async () => {
    const w = await world();
    const gone = await member(w.orgA.id);
    const g = await recipientGroup(w.a, [
      { user_id: gone, channel: 'email' },
      { user_id: w.bob, channel: 'in_app' },
      { external_address: 'ops@example.com', channel: 'email' },
      { external_address: '+15550100', channel: 'sms' },
    ]);
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    // Quiet 07:00-09:00 UTC on Mondays (organization timezone UTC); T0 is Monday 08:00 UTC.
    await setMember(w.orgA.id, w.bob, `quiet_hours = '[{"days":[1],"from":"07:00","to":"09:00"}]'`);
    const p = await escalationPolicy(w.a, [{ after_minutes: 0, channel: 'email', recipient_group_id: g }]);
    const high = await escalationIncident(w.a, w.orgA.id, p.id, T0, { severity: 'high' });
    const critical = await escalationIncident(w.a, w.orgA.id, p.id, T0, { severity: 'critical' });
    await escalate(w.orgA.id, minutes(1));
    const rows = await escalationDeliveries(w.orgA.id);
    const of = (incident: string) =>
      rows
        .filter((d) => d.incident_id === incident)
        .map((d) => [d.recipient_user_id ?? d.recipient_address, d.priority, d.deliver_after && new Date(d.deliver_after).toISOString()]);
    expect(of(high).sort()).toEqual([[w.bob, 'high', '2030-01-07T09:00:00.000Z'], ['ops@example.com', 'high', null]].sort());
    expect(of(critical).sort()).toEqual([[w.bob, 'critical', null], ['ops@example.com', 'critical', null]].sort());
    const log = (await activities(w.a, high)).find((x) => x.kind === 'escalated');
    expect(log?.details).toMatchObject({ recipients: 2 });
  });
});

describe('escalate: manual and empty steps', () => {
  it('should send the next step on manual escalation and time the following step from it', async () => {
    const w = await world();
    const g1 = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const g2 = await recipientGroup(w.a, [{ user_id: w.carol, channel: 'in_app' }]);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 60, channel: 'in_app', recipient_group_id: g1 },
      { after_minutes: 10, channel: 'in_app', recipient_group_id: g2 },
    ]);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id, new Date(Date.now() - 60_000).toISOString());
    const manual = await callFn<{ escalation_step: number; last_escalated_at: string }>(
      w.a, 'escalate_incident', { p_incident: incident, p_reason: 'no answer' }, INCIDENT_FIELDS,
    );
    expect(manual.escalation_step).toBe(1);
    expect(trail(await escalationDeliveries(w.orgA.id, incident))).toEqual([[p.steps[0], 0, w.bob]]);
    const [log] = (await activities(w.a, incident)).filter((x) => x.kind === 'escalated');
    expect(log).toMatchObject({ actor_id: w.user.id, details: { step: 1, step_id: p.steps[0], manual: true, reason: 'no answer', recipients: 1 } });
    // Step 2 is due 10 minutes after the manual escalation (+1 ms: the stored time has microseconds).
    expect(await escalate(w.orgA.id, minutes(9.99, manual.last_escalated_at))).toEqual([]);
    expect(await escalate(w.orgA.id, minutes(10 + 1 / 60_000, manual.last_escalated_at))).toMatchObject([{ escalation_step: 2 }]);
    expect(trail(await escalationDeliveries(w.orgA.id, incident))).toEqual([[p.steps[0], 0, w.bob], [p.steps[1], 0, w.carol]]);
    // Past the last step (no repeat) a manual escalation only bumps and logs.
    const after = await callFn<{ escalation_step: number }>(w.a, 'escalate_incident', { p_incident: incident }, INCIDENT_FIELDS);
    expect(after.escalation_step).toBe(3);
    expect(await escalationDeliveries(w.orgA.id, incident)).toHaveLength(2);
  });

  it('should log why a step reached nobody', async () => {
    const w = await world();
    const gone = await member(w.orgA.id);
    const g = await recipientGroup(w.a, [{ user_id: gone, channel: 'in_app' }]);
    const schedule = await onCallSchedule(w.a, [gone]);
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 0, channel: 'in_app', recipient_group_id: g },
      { after_minutes: 0, channel: 'in_app', on_call_schedule_id: schedule },
    ]);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id);
    await escalate(w.orgA.id, minutes(1));
    await escalate(w.orgA.id, minutes(2));
    const log = (await activities(w.a, incident)).filter((x) => x.kind === 'escalated');
    expect(log.map((x) => x.details)).toEqual([
      expect.objectContaining({ step: 1, recipients: 0, reason: 'no_active_recipients' }),
      expect.objectContaining({ step: 2, recipients: 0, reason: 'no_on_call_member' }),
    ]);
  });
});

describe('escalate cron', () => {
  beforeAll(requireBackend);

  it('should escalate due incidents of every organization at the scheduled time', async () => {
    const w = await world();
    const g = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const p = await escalationPolicy(w.a, [
      { after_minutes: 0, channel: 'in_app', recipient_group_id: g },
      { after_minutes: 600, channel: 'in_app', recipient_group_id: g },
    ]);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id, new Date(Date.now() - 60_000).toISOString());
    const res = await postTrigger('escalate', cronPayload('escalate'));
    expect(res.status).toBe(200);
    // The live cron may have taken the step first: either way exactly one step, once.
    await waitFor(() => incidentState(incident), (s) => s.escalation_step === 1);
    expect((await postTrigger('escalate', cronPayload('escalate'))).status).toBe(200);
    expect(trail(await escalationDeliveries(w.orgA.id, incident))).toEqual([[p.steps[0], 0, w.bob]]);
  });
});

