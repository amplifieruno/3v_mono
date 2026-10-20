import { describe, expect, it } from 'vitest';
import { sqlHold } from './support/compliance.js';
import { runSql, runSqlRows } from './support/sql.js';
import {
  ago,
  count,
  fileRow,
  inRetentionContext,
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

/** Task 2 fix round 1: audit redaction, indirect holds, linkability, file queue claim, minors. */

const authApp = (org: string) =>
  insertRow('client_applications', { organization_id: q(org), name: q(`App ${Date.now()}${Math.random()}`), platform: q('kiosk') });

const attempt = (org: string, app: string, extra: Record<string, string>) =>
  insertRow('authentication_attempts', {
    organization_id: q(org), application_id: q(app), attempt_no: '1', step: q('initial'), mode: q('identification'),
    outcome: q('success'), attempted_at: ago(40), ...extra,
  });

describe('retention fixes: audit', () => {
  it('should audit purged rows as {"retention": true} without their old values', async () => {
    const w = await retentionWorld();
    const [start] = await runSqlRows(`select clock_timestamp()::text as t`);
    const incident = await insertRow('incidents', {
      organization_id: q(w.org), title: q('Secret Person Name'), description: q('Seen near PII-DESC'), status: q('closed'),
      acknowledged_at: ago(40), resolved_at: ago(40), disposition: q('benign'), resolution: q('PII-RESOLUTION'),
    });
    const identity = await sqlIdentity(w.org, { last_seen_at: ago(40), attributes: `'{"note":"PII-ATTR"}'::jsonb` });
    await purge('incidents', w.org, ago(30), { action: 'anonymize' });
    await purge('unknown_identities', w.org, ago(30));
    const rows = await runSqlRows(
      `select entity, action, changes::text as c from itap.audit_log
       where organization_id = '${w.org}' and occurred_at > '${start.t}' and entity_id in ('${incident}', '${identity}')
         and action in ('update', 'delete')`,
    );
    expect(rows.map((r) => [r.entity, r.action, r.c])).toEqual(
      expect.arrayContaining([
        ['incidents', 'update', '{"retention": true}'],
        ['identities', 'delete', '{"retention": true}'],
      ]),
    );
    const leaked = await count(
      `itap.audit_log where organization_id = '${w.org}' and occurred_at > '${start.t}'
         and changes::text ~ 'PII-|Secret Person' and action <> 'insert'`,
    );
    expect(leaked).toBe(0);
  });
});

describe('retention fixes: indirect holds and subjects', () => {
  it('should hold events naming a held person in the payload or through their attempt, and deliveries of held incidents', async () => {
    const w = await retentionWorld();
    const held = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    const app = await authApp(w.org);
    const viaAttempt = await attempt(w.org, app, { matched_identity_id: q(held) });
    const byPayload = await sqlEvent(w.org, 40, { event_type: q('auth_success'), payload: `'{"claimed_identity_id":"${held}"}'::jsonb` });
    const byAttempt = await sqlEvent(w.org, 40, { event_type: q('auth_success'), authentication_attempt_id: q(viaAttempt) });
    const free = await sqlEvent(w.org, 40);
    expect(await purgeAll('events', w.org, ago(30))).toMatchObject({ affected: 1, skipped_by_hold: 2 });
    expect(await count(`itap.events where id in ('${byPayload}', '${byAttempt}')`)).toBe(2);
    expect(await count(`itap.events where id = '${free}'`)).toBe(0);

    const incident = await insertRow('incidents', { organization_id: q(w.org), title: q('Held') });
    await sqlHold(w.org, { incident_id: incident });
    const linked = await sqlEvent(w.org, 40);
    await insertRow('incident_events', { organization_id: q(w.org), incident_id: q(incident), event_id: q(linked) });
    const d = await insertRow('notification_deliveries', {
      organization_id: q(w.org), channel: q('email'), recipient_address: q('a@example.test'), status: q('sent'),
      content: `'{"report_code":"R"}'::jsonb`, event_id: q(linked), created_at: ago(40),
    });
    expect(await purgeAll('deliveries', w.org, ago(30))).toMatchObject({ affected: 0, skipped_by_hold: 1 });
    expect(await count(`itap.notification_deliveries where id = '${d}'`)).toBe(1);
  });

  it('should find a subject in event payloads and attempts (DSR)', async () => {
    const w = await retentionWorld();
    const subject = await sqlIdentity(w.org);
    const app = await authApp(w.org);
    const a = await attempt(w.org, app, { claimed_identity_id: q(subject) });
    await sqlEvent(w.org, 40, { event_type: q('auth_failed'), payload: `'{"matched_identity_id":"${subject}"}'::jsonb` });
    await sqlEvent(w.org, 40, { event_type: q('auth_failed'), authentication_attempt_id: q(a) });
    await sqlEvent(w.org, 40);
    expect(await purgeAll('events', w.org, 'now()', { subjectIdentity: subject })).toMatchObject({ affected: 2 });
    expect(await count(`itap.events where organization_id = '${w.org}'`)).toBe(1);
  });

  it('should hold an unknown identity whose evidence lies in a held facility', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org, { last_seen_at: ago(40) });
    await insertRow('identity_locations', {
      organization_id: q(w.org), facility_id: q(w.facility.id), identity_id: q(identity), movement_type: q('entry'),
      occurred_at: ago(40),
    });
    await sqlHold(w.org, { facility_id: w.facility.id });
    expect(await purgeAll('unknown_identities', w.org, ago(30))).toMatchObject({ affected: 0, skipped_by_hold: 1 });
    expect(await count(`itap.identities where id = '${identity}'`)).toBe(1);
  });
});

describe('retention fixes: anonymized rows are not linkable', () => {
  it('should rewrite dedup keys, drop detection links, the age and override justifications', async () => {
    const w = await retentionWorld();
    const ev = await sqlEvent(w.org, 40, {
      event_type: q('emergency_override_started'), dedup_key: q(`override:${Date.now()}:started`),
      payload: `'{"justification":"Evacuate because of John","mode":"lock_all"}'::jsonb`,
    });
    const inc = await insertRow('incidents', {
      organization_id: q(w.org), title: q('T'), status: q('closed'), acknowledged_at: ago(40), resolved_at: ago(40),
      disposition: q('benign'), dedup_key: q(`session:${Date.now()}:rule:x`),
    });
    const dec = await insertRow('access_decisions', {
      organization_id: q(w.org), result: q('denied'), reason: q('no_rule'), epoch: '0', decided_at: ago(40),
      detection_id: 'gen_random_uuid()',
    });
    const session = await insertRow('tracking_sessions', {
      organization_id: q(w.org), facility_id: q(w.facility.id), identity_id: q(await sqlIdentity(w.org)), status: q('completed'),
      started_at: ago(41), last_detected_at: ago(40), ended_at: ago(40), opened_by_detection_id: 'gen_random_uuid()',
    });
    const identity = await sqlIdentity(w.org, { last_seen_at: ago(40), attributes: `'{"age": 41}'::jsonb` });
    for (const cls of ['events', 'incidents', 'access_decisions', 'sessions', 'unknown_identities']) {
      await purgeAll(cls, w.org, ago(30), { action: 'anonymize' });
    }
    const [e] = await runSqlRows(`select dedup_key, payload::text as p from itap.events where id = '${ev}'`);
    expect(e.dedup_key).toBe(`anonymized:${ev}`);
    expect(JSON.parse(String(e.p))).toEqual({ mode: 'lock_all', anonymized: true });
    const [i] = await runSqlRows(`select dedup_key from itap.incidents where id = '${inc}'`);
    expect(i.dedup_key).toBe(`anonymized:${inc}`);
    const [d] = await runSqlRows(`select detection_id from itap.access_decisions where id = '${dec}'`);
    expect(d.detection_id).toBe('NULL');
    const [s] = await runSqlRows(`select opened_by_detection_id from itap.tracking_sessions where id = '${session}'`);
    expect(s.opened_by_detection_id).toBe('NULL');
    const [p] = await runSqlRows(`select age from itap.identities where id = '${identity}'`);
    expect(p.age).toBe('NULL');
  });
});

describe('retention fixes: file queue', () => {
  it('should drop queued files that are referenced again and lease claimed rows', async () => {
    const w = await retentionWorld();
    const reused = await fileRow(w.org, 'identity_photo');
    const free = await fileRow(w.org, 'misc');
    const foreign = await fileRow(w.orgB, 'misc');
    // Referenced again behind the queue's back (check_file_bucket now refuses attaching a queued file).
    await runSql(`update itap.identities set primary_photo_file_id = '${reused}' where id = '${await sqlIdentity(w.org)}'`);
    await runSql(`select itap.enqueue_file_deletion('${w.org}', '${reused}', 't'), itap.enqueue_file_deletion('${w.org}', '${free}', 't'),
      itap.enqueue_file_deletion('${w.orgB}', '${foreign}', 't')`);
    const claimed = await runSqlRows(`select file_id from itap.claim_file_deletions(5000, '${w.org}')`);
    const ids = claimed.map((r) => r.file_id);
    expect(ids).toContain(free);
    expect(ids).not.toContain(reused);
    expect(await queued(reused)).toBe(false);
    const again = await runSqlRows(`select file_id from itap.claim_file_deletions(5000, '${w.org}')`);
    expect(again.map((r) => r.file_id)).not.toContain(free);
    // Scoped to the organization: another organization's row is neither handed out nor leased.
    expect(ids).not.toContain(foreign);
    const [other] = await runSqlRows(`select lease_expires_at from itap.pending_file_deletions where file_id = '${foreign}'`);
    expect(other.lease_expires_at).toBe('NULL');
    await runSql(`update itap.pending_file_deletions set lease_expires_at = null where file_id = '${free}'`);
  });

  it('should cover every file column (FK to storage.files or *file_id) in itap.file_in_use', async () => {
    const columns = await runSqlRows(
      `select c.table_name as t, c.column_name as c from information_schema.columns c
       where c.table_schema = 'itap' and c.column_name ~ '(^|_)file_id$' and c.table_name <> 'pending_file_deletions'
       union
       select cl.relname, a.attname from pg_constraint k
       join pg_class cl on cl.oid = k.conrelid join pg_namespace n on n.oid = cl.relnamespace
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
       where k.contype = 'f' and k.confrelid = 'storage.files'::regclass and n.nspname = 'itap'
         and cl.relname <> 'pending_file_deletions'`,
    );
    const [fn] = await runSqlRows(`select prosrc from pg_proc where proname = 'file_in_use' and pronamespace = 'itap'::regnamespace`);
    const src = String(fn.prosrc);
    const missing = columns.filter(({ t, c }) => !new RegExp(`itap\\.${t} x WHERE [^\\n]*x\\.${c} = p_file`).test(src));
    expect(missing).toEqual([]);
    expect(columns.length).toBeGreaterThanOrEqual(17);
  });
});

describe('retention fixes: minors', () => {
  it('should sweep orphan tagged report files, purge grants on anonymize and keep the epoch bump for live grants', async () => {
    const w = await retentionWorld();
    const orphan = await fileRow(w.org, 'report', { report_id: '00000000-0000-4000-8000-000000000001' });
    await runSql(`update storage.files set created_at = now() - interval '40 days' where id = '${orphan}'`);
    const r = await purgeAll('reports', w.org, ago(30));
    expect(r).toMatchObject({ affected: 1, files_enqueued: 1 });
    expect(await queued(orphan)).toBe(true);

    const profile = await sqlProfile(w.org);
    const area = await insertRow('areas', { organization_id: q(w.org), facility_id: q(w.facility.id), name: q('Room') });
    const used = await insertRow('access_grants', {
      organization_id: q(w.org), profile_id: q(profile), area_id: q(area), valid_from: ago(500), valid_until: ago(450),
    });
    await insertRow('access_decisions', {
      organization_id: q(w.org), result: q('granted'), reason: q('grant'), epoch: '0', decided_at: ago(440), grant_id: q(used),
    });
    await purgeAll('access_decisions', w.org, ago(30), { action: 'anonymize' });
    expect(await count(`itap.access_grants where id = '${used}'`)).toBe(0);

    const live = await insertRow('access_grants', {
      organization_id: q(w.org), profile_id: q(profile), area_id: q(area), valid_from: ago(1), valid_until: `now() + interval '1 day'`,
    });
    const epoch = async () =>
      (await runSqlRows(`select policy_urgent_epoch from itap.organization_settings where organization_id = '${w.org}'`))[0].policy_urgent_epoch;
    const before = await epoch();
    await inRetentionContext(`delete from itap.access_grants where id = '${live}'`);
    expect(Number(await epoch())).toBeGreaterThan(Number(before));
    const [o] = await runSqlRows(`select itap.retention_class_order('reports') < itap.retention_class_order('incidents') as ok`);
    expect(o.ok).toBe('t');
  });
});
