import { describe, expect, it } from 'vitest';
import { sqlHold } from './support/compliance.js';
import { runSql, runSqlRows } from './support/sql.js';
import {
  ago,
  camera,
  count,
  fileRow,
  insertRow,
  purge,
  purgeAll,
  q,
  queued,
  retentionWorld,
  sqlEvent,
  sqlIdentity,
  sqlProfile,
} from './support/retention.js';

/** Retention classes deliveries, webhook_deliveries, incidents, access_decisions, terminal_syncs, stats, audit. */

const delivery = (org: string, days: number, extra: Record<string, string> = {}) =>
  insertRow('notification_deliveries', {
    organization_id: q(org),
    channel: q('email'),
    recipient_address: q('ops@example.test'),
    status: q('sent'),
    content: `'{"report_code":"R-1"}'::jsonb`,
    created_at: ago(days),
    ...extra,
  });

const closedIncident = (org: string, days: number, extra: Record<string, string> = {}) =>
  insertRow('incidents', {
    organization_id: q(org),
    title: q('Tailgating: Door 1'),
    description: q('Two people'),
    status: q('closed'),
    acknowledged_at: ago(days),
    resolved_at: ago(days),
    disposition: q('true_positive'),
    resolution: q('Talked to the person'),
    ...extra,
  });

const decision = (org: string, days: number, extra: Record<string, string> = {}) =>
  insertRow('access_decisions', {
    organization_id: q(org),
    result: q('granted'),
    reason: q('grant'),
    epoch: '0',
    decided_at: ago(days),
    signals: `'{"person":{"identity":"x"},"epoch":0}'::jsonb`,
    ...extra,
  });

describe('retention: deliveries and webhook deliveries', () => {
  it('should delete finished deliveries and inbox rows, a digest only with its sources, never in-flight rows', async () => {
    const w = await retentionWorld();
    const digest = await delivery(w.org, 40);
    const source = await delivery(w.org, 41, { status: q('digested'), digested_into: q(digest) });
    // In flight (not yet due, so the sender leaves it alone during the test).
    const pending = await delivery(w.org, 40, { status: q('pending'), deliver_after: `now() + interval '1 day'` });
    const recent = await delivery(w.org, 1);
    const inbox = await insertRow('user_notifications', {
      organization_id: q(w.org), user_id: q(w.userId), title: q('Hi'), created_at: ago(40),
    });
    // limit 1: the digest may only go in the batch that also holds its source.
    const r = await purgeAll('deliveries', w.org, ago(30), { limit: 1 });
    expect(r.affected).toBe(3);
    expect(await count(`itap.notification_deliveries where id in ('${digest}', '${source}')`)).toBe(0);
    expect(await count(`itap.user_notifications where id = '${inbox}'`)).toBe(0);
    expect(await count(`itap.notification_deliveries where id in ('${pending}', '${recent}')`)).toBe(2);
  });

  it('should keep deliveries of held incidents and webhook deliveries of held people', async () => {
    const w = await retentionWorld();
    const incident = await insertRow('incidents', { organization_id: q(w.org), title: q('Held') });
    await sqlHold(w.org, { incident_id: incident });
    const kept = await delivery(w.org, 40, { incident_id: q(incident) });
    expect(await purgeAll('deliveries', w.org, ago(30))).toMatchObject({ affected: 0, skipped_by_hold: 1 });
    expect(await count(`itap.notification_deliveries where id = '${kept}'`)).toBe(1);

    const held = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    const heldEvent = await sqlEvent(w.org, 40, { identity_id: q(held) });
    const freeEvent = await sqlEvent(w.org, 40);
    const sub = await insertRow('webhook_subscriptions', {
      organization_id: q(w.org), url: q('https://example.test/hook'), secret: q('0123456789abcdef0123'),
    });
    const hook = (event: string, status: string) =>
      insertRow('webhook_deliveries', {
        organization_id: q(w.org), subscription_id: q(sub), event_id: q(event), event_type: q('detection_known'),
        body: `'{}'::jsonb`, status: q(status), created_at: ago(40),
      });
    const heldHook = await hook(heldEvent, 'sent');
    const freeHook = await hook(freeEvent, 'dead_letter');
    expect(await purgeAll('webhook_deliveries', w.org, ago(30))).toMatchObject({ affected: 1, skipped_by_hold: 1 });
    expect(await count(`itap.webhook_deliveries where id = '${freeHook}'`)).toBe(0);
    expect(await count(`itap.webhook_deliveries where id = '${heldHook}'`)).toBe(1);
  });
});

describe('retention: incidents', () => {
  it('should delete closed incidents with notes (files queued) and ended-hold targets, keeping open, held and reported ones', async () => {
    const w = await retentionWorld();
    const gone = await closedIncident(w.org, 40);
    const note = await insertRow('incident_notes', { organization_id: q(w.org), incident_id: q(gone), author_id: q(w.userId), body: q('Seen') });
    const file = await fileRow(w.org, 'incident_note');
    await insertRow('incident_note_files', { organization_id: q(w.org), note_id: q(note), file_id: q(file) });
    await sqlHold(w.org, { incident_id: gone }, { starts: ago(100), ends: ago(50) });
    const open = await insertRow('incidents', { organization_id: q(w.org), title: q('Open') });
    const held = await closedIncident(w.org, 40);
    await sqlHold(w.org, { incident_id: held });
    const reported = await closedIncident(w.org, 40);
    await insertRow('reports', {
      organization_id: q(w.org), report_type: q('incident'), title: q('Incident report'), incident_id: q(reported),
    });

    expect(await purgeAll('incidents', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 1, files_enqueued: 1 });
    expect(await count(`itap.incidents where id = '${gone}'`)).toBe(0);
    expect(await count(`itap.incident_notes where id = '${note}'`)).toBe(0);
    expect(await queued(file)).toBe(true);
    expect(await count(`itap.incidents where id in ('${open}', '${held}', '${reported}')`)).toBe(3);
  });

  it('should anonymize incidents: text cleared, notes and identities removed, codes and times kept', async () => {
    const w = await retentionWorld();
    const id = await closedIncident(w.org, 40);
    const identity = await sqlIdentity(w.org);
    await insertRow('incident_identities', { organization_id: q(w.org), incident_id: q(id), identity_id: q(identity) });
    await insertRow('incident_notes', { organization_id: q(w.org), incident_id: q(id), author_id: q(w.userId), body: q('Name: X') });
    expect(await purge('incidents', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 1 });
    const [i] = await runSqlRows(`select title, description, resolution, status, code from itap.incidents where id = '${id}'`);
    expect(i).toMatchObject({ title: '[anonymized]', description: 'NULL', resolution: 'NULL', status: 'closed' });
    expect(await count(`itap.incident_identities where incident_id = '${id}'`)).toBe(0);
    expect(await count(`itap.incident_notes where incident_id = '${id}'`)).toBe(0);
    expect(await count(`itap.incident_activities where incident_id = '${id}' and details <> '{}'::jsonb`)).toBe(0);
    expect(await purge('incidents', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 0 });
  });
});

describe('retention: access decisions (FK order: decisions before grants and overrides)', () => {
  it('should delete decisions, then the used / expired grants and ended overrides they referenced', async () => {
    const w = await retentionWorld();
    const profile = await sqlProfile(w.org);
    const area = await insertRow('areas', { organization_id: q(w.org), facility_id: q(w.facility.id), name: q('Room') });
    const grant = await insertRow('access_grants', {
      organization_id: q(w.org), profile_id: q(profile), area_id: q(area), valid_from: ago(500), valid_until: ago(450),
    });
    const activeGrant = await insertRow('access_grants', {
      organization_id: q(w.org), profile_id: q(profile), area_id: q(area), valid_from: ago(1), valid_until: 'now() + interval \'1 day\'',
    });
    await runSql(
      `select set_config('itap.override_context', 'on', true);
       insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, started_at, ends_at, ended_at, end_reason)
       values ('${w.org}', '${w.facility.id}', 'unlock_all', 'Retention FK order test', now() - interval '400 days',
               now() - interval '400 days' + interval '1 hour', now() - interval '400 days' + interval '1 hour', 'expired')`,
    );
    const [override] = await runSqlRows(`select id from itap.emergency_overrides where organization_id = '${w.org}'`);
    await decision(w.org, 440, { grant_id: q(grant), profile_id: q(profile) });
    await decision(w.org, 399, { override_id: q(String(override.id)), reason: q('override_unlock') });
    const recent = await decision(w.org, 1, { grant_id: q(activeGrant) });

    const r = await purgeAll('access_decisions', w.org, ago(30));
    expect(r.affected).toBe(4); // 2 decisions + 1 grant + 1 override
    expect(await count(`itap.access_decisions where organization_id = '${w.org}'`)).toBe(1);
    expect(await count(`itap.access_grants where id = '${grant}'`)).toBe(0);
    expect(await count(`itap.access_grants where id = '${activeGrant}'`)).toBe(1);
    expect(await count(`itap.emergency_overrides where organization_id = '${w.org}'`)).toBe(0);
    expect(await count(`itap.access_decisions where id = '${recent}'`)).toBe(1);
  });

  it('should anonymize decisions (person, grant, trace person section) and keep held ones', async () => {
    const w = await retentionWorld();
    const held = await sqlProfile(w.org);
    await sqlHold(w.org, { profile_id: held });
    const free = await sqlProfile(w.org);
    const id = await decision(w.org, 40, { profile_id: q(free) });
    const keep = await decision(w.org, 40, { profile_id: q(held) });
    expect(await purgeAll('access_decisions', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 1, skipped_by_hold: 1 });
    const [d] = await runSqlRows(`select profile_id, signals::text as s from itap.access_decisions where id = '${id}'`);
    expect(d.profile_id).toBe('NULL');
    expect(JSON.parse(String(d.s))).toEqual({ epoch: 0, anonymized: true });
    const [k] = await runSqlRows(`select profile_id from itap.access_decisions where id = '${keep}'`);
    expect(k.profile_id).toBe(held);
  });
});

describe('retention: terminal syncs, stats, audit', () => {
  it('should delete old terminal sync rows and urgent epochs no terminal still needs', async () => {
    const w = await retentionWorld();
    const device = await camera(w.a, w.facility.id);
    const sync = await insertRow('terminal_policy_syncs', {
      organization_id: q(w.org), facility_id: q(w.facility.id), device_id: q(device), epoch: '1', urgent: 'true',
      result: q('synced'), created_at: ago(40),
    });
    await runSql(`insert into itap.policy_urgent_epochs (organization_id, epoch, created_at) values ('${w.org}', 999001, now() - interval '40 days')`);
    expect(await purgeAll('terminal_syncs', w.org, ago(30))).toMatchObject({ affected: 2 });
    expect(await count(`itap.terminal_policy_syncs where id = '${sync}'`)).toBe(0);
    expect(await count(`itap.policy_urgent_epochs where organization_id = '${w.org}' and epoch = 999001`)).toBe(0);
  });

  it('should delete old stats buckets except those of a held facility', async () => {
    const w = await retentionWorld();
    await runSql(
      `insert into itap.area_hourly_stats (organization_id, facility_id, hour) values
         ('${w.org}', '${w.facility.id}', date_trunc('hour', now() - interval '40 days')),
         ('${w.org}', '${w.other.id}', date_trunc('hour', now() - interval '40 days')),
         ('${w.org}', '${w.facility.id}', date_trunc('hour', now() - interval '2 days'));
       insert into itap.facility_daily_stats (organization_id, facility_id, day) values
         ('${w.org}', '${w.facility.id}', (now() - interval '40 days')::date)`,
    );
    await sqlHold(w.org, { facility_id: w.other.id });
    expect(await purgeAll('stats', w.org, ago(30))).toMatchObject({ affected: 2, skipped_by_hold: 1 });
    expect(await count(`itap.area_hourly_stats where organization_id = '${w.org}'`)).toBe(2);
    expect(await count(`itap.facility_daily_stats where organization_id = '${w.org}'`)).toBe(0);
  });

  it('should respect the 365-day audit floor, delete or anonymize older rows and keep rows about held subjects', async () => {
    const w = await retentionWorld();
    const held = await sqlProfile(w.org);
    await sqlHold(w.org, { profile_id: held });
    const row = (entity: string, id: string) =>
      insertRow('audit_log', {
        organization_id: q(w.org), user_id: q(w.userId), action: q('update'), entity: q(entity), entity_id: q(id),
        changes: `'{"first_name":["A","B"]}'::jsonb`, ip: q('10.0.0.1'), occurred_at: ago(400),
      });
    const heldRow = await row('profiles', held);
    const other = await row('profiles', await sqlProfile(w.org));
    await expect(purge('audit', w.org, ago(30))).rejects.toThrow(/retention_floor/);
    const r = await purgeAll('audit', w.org, ago(365), { action: 'anonymize' });
    expect(r.skipped_by_hold).toBe(1);
    const [a] = await runSqlRows(`select user_id, ip, changes::text as c from itap.audit_log where id = '${other}'`);
    expect(a).toEqual({ user_id: 'NULL', ip: 'NULL', c: '{"anonymized": true}' });
    await purgeAll('audit', w.org, ago(365));
    expect(await count(`itap.audit_log where id = '${other}'`)).toBe(0);
    expect(await count(`itap.audit_log where id = '${heldRow}'`)).toBe(1);
  });
});
