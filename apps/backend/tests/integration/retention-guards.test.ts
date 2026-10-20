import { describe, expect, it } from 'vitest';
import { runSql, runSqlRows } from './support/sql.js';
import {
  ago,
  count,
  inRetentionContext,
  insertRow,
  q,
  retentionWorld,
  sqlEvent,
  sqlIdentity,
  sqlProfile,
} from './support/retention.js';

/** Review Focus 5: append-only guards are bypassed only inside itap.retention_context. */

const decision = (org: string, extra: Record<string, string> = {}): Promise<string> =>
  insertRow('access_decisions', {
    organization_id: q(org),
    result: q('denied'),
    reason: q('no_rule'),
    epoch: '0',
    decided_at: ago(400),
    ...extra,
  });

const audit = (org: string): Promise<string> =>
  insertRow('audit_log', { organization_id: q(org), action: q('update'), entity: q('profiles'), occurred_at: ago(400) });

describe('retention: append-only guards', () => {
  it('should refuse direct deletes and edits of events, decisions and audit rows, and allow them in the context', async () => {
    const w = await retentionWorld();
    const event = await sqlEvent(w.org, 400);
    const dec = await decision(w.org);
    const row = await audit(w.org);
    await expect(runSql(`delete from itap.events where id = '${event}'`)).rejects.toThrow(/events_append_only/);
    await expect(runSql(`update itap.events set title = 'x' where id = '${event}'`)).rejects.toThrow(/events_append_only/);
    await expect(runSql(`delete from itap.access_decisions where id = '${dec}'`)).rejects.toThrow(/access_decisions_append_only/);
    await expect(runSql(`update itap.access_decisions set reason = 'grant' where id = '${dec}'`)).rejects.toThrow(
      /access_decisions_append_only/,
    );
    await expect(runSql(`delete from itap.audit_log where id = '${row}'`)).rejects.toThrow(/audit_log_append_only/);
    await expect(runSql(`update itap.audit_log set reason = 'x' where id = '${row}'`)).rejects.toThrow(/audit_log_append_only/);
    // A context set in another transaction does not leak.
    await runSql(`select set_config('itap.retention_context', 'on', true)`);
    await expect(runSql(`delete from itap.events where id = '${event}'`)).rejects.toThrow(/events_append_only/);

    await inRetentionContext(`update itap.audit_log set reason = 'anonymized' where id = '${row}'`);
    await inRetentionContext(`delete from itap.events where id = '${event}'`);
    await inRetentionContext(`delete from itap.access_decisions where id = '${dec}'`);
    await inRetentionContext(`delete from itap.audit_log where id = '${row}'`);
    expect(await count(`itap.events where id = '${event}'`)).toBe(0);
    expect(await count(`itap.access_decisions where id = '${dec}'`)).toBe(0);
    expect(await count(`itap.audit_log where id = '${row}'`)).toBe(0);
  });

  it('should still let FK actions null the person of a log row and an organization delete cascade', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    const profile = await sqlProfile(w.org);
    const event = await sqlEvent(w.org, 1, { identity_id: q(identity), profile_id: q(profile) });
    const dec = await decision(w.org, { identity_id: q(identity) });
    await runSql(`delete from itap.identities where id = '${identity}'`);
    const [e] = await runSqlRows(`select identity_id from itap.events where id = '${event}'`);
    expect(e.identity_id).toBe('NULL');
    const [d] = await runSqlRows(`select identity_id from itap.access_decisions where id = '${dec}'`);
    expect(d.identity_id).toBe('NULL');
    await runSql(`delete from itap.organizations where id = '${w.orgB}'`);
    const orphan = await audit(w.orgB);
    await runSql(`delete from itap.audit_log where id = '${orphan}'`);
  });

  it('should refuse deleting authentication attempts, used grants and emergency overrides outside the context', async () => {
    const w = await retentionWorld();
    const app = await insertRow('client_applications', { organization_id: q(w.org), name: q(`App ${Date.now()}`), platform: q('kiosk') });
    const attempt = await insertRow('authentication_attempts', {
      organization_id: q(w.org),
      application_id: q(app),
      attempt_no: '1',
      step: q('initial'),
      mode: q('identification'),
      outcome: q('failure'),
      failure_reason: q('below_threshold'),
      attempted_at: ago(400),
    });
    await expect(runSql(`delete from itap.authentication_attempts where id = '${attempt}'`)).rejects.toThrow(
      /authentication_attempt_immutable/,
    );
    await expect(runSql(`update itap.authentication_attempts set ip = '10.0.0.1' where id = '${attempt}'`)).rejects.toThrow(
      /authentication_attempt_immutable/,
    );
    await inRetentionContext(`update itap.authentication_attempts set user_agent = null, ip = null where id = '${attempt}'`);
    await inRetentionContext(`delete from itap.authentication_attempts where id = '${attempt}'`);

    const profile = await sqlProfile(w.org);
    const area = await insertRow('areas', { organization_id: q(w.org), facility_id: q(w.facility.id), name: q('Room') });
    const grant = await insertRow('access_grants', {
      organization_id: q(w.org),
      profile_id: q(profile),
      area_id: q(area),
      valid_from: ago(500),
      valid_until: ago(450),
      single_use: 'true',
    });
    await runSql(`update itap.access_grants set used_at = now() - interval '460 days' where id = '${grant}'`);
    await expect(runSql(`delete from itap.access_grants where id = '${grant}'`)).rejects.toThrow(/access_grant_used/);
    const [before] = await runSqlRows(`select policy_urgent_epoch from itap.organization_settings where organization_id = '${w.org}'`);
    await inRetentionContext(`delete from itap.access_grants where id = '${grant}'`);
    const [after] = await runSqlRows(`select policy_urgent_epoch from itap.organization_settings where organization_id = '${w.org}'`);
    expect(after.policy_urgent_epoch).toBe(before.policy_urgent_epoch);

    await runSql(
      `select set_config('itap.override_context', 'on', true);
       insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, started_at, ends_at, ended_at, end_reason)
       values ('${w.org}', '${w.facility.id}', 'lock_all', 'Retention guard test', now() - interval '400 days',
               now() - interval '400 days' + interval '1 hour', now() - interval '400 days' + interval '1 hour', 'expired')`,
    );
    const where = `organization_id = '${w.org}' and facility_id = '${w.facility.id}'`;
    await expect(runSql(`delete from itap.emergency_overrides where ${where}`)).rejects.toThrow(/emergency_override_function_only/);
    await inRetentionContext(`delete from itap.emergency_overrides where ${where}`);
    expect(await count(`itap.emergency_overrides where ${where}`)).toBe(0);
  });
});
