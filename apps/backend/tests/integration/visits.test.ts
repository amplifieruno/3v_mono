import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createFacility } from './support/facilities.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, createTrackingWorld, detect, sessions } from './support/tracking.js';
import { createVisit, personOfType, runLifecycle, visitById, visitFn } from './support/visits.js';

const HOUR = 3600;

async function setup() {
  const w = await createTrackingWorld();
  return { ...w, visitor: await personOfType(w.a, 'visitor'), host: await personOfType(w.a, 'employee') };
}
const sessionVisit = async (identity: string): Promise<string | null> => {
  const rows = await runSqlRows(`SELECT visit_id FROM itap.tracking_sessions WHERE identity_id = '${identity}'`);
  return rows[0].visit_id === 'NULL' ? null : rows[0].visit_id;
};

describe('visits table', () => {
  it('should create VISIT-xxxxx scheduled and reject wrong profile types and bad time ranges', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR, { host_profile_id: s.host.profile, purpose: 'Demo' });
    expect(visit).toMatchObject({ status: 'scheduled', purpose: 'Demo', checked_in_at: null });
    expect(visit.code).toMatch(/^VISIT-\d{5}$/);
    const asVisitor = await expectError(createVisit(s.a, s.host.profile, 0, HOUR));
    expect(asVisitor.message).toContain('visit_visitor_not_visitor');
    const hostVisitor = await expectError(createVisit(s.a, s.visitor.profile, 0, HOUR, { host_profile_id: s.visitor.profile }));
    expect(hostVisitor.message).toContain('visit_host_is_visitor');
    await expectError(createVisit(s.a, s.visitor.profile, HOUR, HOUR));
    await expectError(createVisit(s.a, s.visitor.profile, HOUR, 0));
    // Changing the profile later is validated too.
    const other = await personOfType(s.a, 'contractor');
    await expectError(updateByPk(s.a, 'visits', visit.id, { visitor_profile_id: other.profile }));
  });

  it('should keep status and check-in/out timestamps read-only for org_admin', async () => {
    const s = await setup();
    await expectDenied(createVisit(s.a, s.visitor.profile, 0, HOUR, { status: 'checked_in' }), 'status');
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    await expectDenied(updateByPk(s.a, 'visits', visit.id, { status: 'checked_in' }), 'status');
    await expectDenied(updateByPk(s.a, 'visits', visit.id, { checked_in_at: at(0) }), 'checked_in_at');
    await expectDenied(updateByPk(s.a, 'visits', visit.id, { checked_out_at: at(0) }), 'checked_out_at');
    await expectDenied(updateByPk(s.a, 'visits', visit.id, { number: 99 }), 'number');
    await updateByPk(s.a, 'visits', visit.id, { purpose: 'Interview', badge_number: 'B-7' });
    expect(await visitById(visit.id)).toMatchObject({ purpose: 'Interview', badge_number: 'B-7' });
  });

  it('should be tenant scoped: foreign profile, facility and company are rejected, other orgs see nothing', async () => {
    const s = await setup();
    const foreign = await personOfType(asOrgAdmin(s.other.id, s.orgB.id), 'visitor');
    await expectError(createVisit(s.a, foreign.profile, 0, HOUR));
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    const seen = await b.request<{ visits: { id: string }[] }>(`query { visits { id } }`);
    expect(seen.visits).toEqual([]);
    await expectDenied(createVisit(s.a, s.visitor.profile, 0, HOUR, { organization_id: s.orgB.id }), 'organization_id');
    expect(visit.id).toBeTruthy();
  });

  it('should validate status transitions for every writer and write audit rows', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const bad = (to: string) =>
      runSql(`UPDATE itap.visits SET status = '${to}' WHERE id = '${visit.id}'`);
    await expect(bad('checked_out')).rejects.toThrow('visit_invalid_transition');
    await runSql(`UPDATE itap.visits SET status = 'cancelled' WHERE id = '${visit.id}'`);
    await expect(bad('scheduled')).rejects.toThrow('visit_invalid_transition');
    await expect(bad('checked_in')).rejects.toThrow('visit_invalid_transition');
    const audit = await runSqlRows(`SELECT action FROM itap.audit_log WHERE entity = 'visits' AND entity_id = '${visit.id}'`);
    expect(audit.map((r) => r.action).sort()).toEqual(['insert', 'update']);
  });

  it('should not be deletable by org_admin and the tracking_sessions link becomes null when a visit is removed', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, -HOUR, HOUR);
    await expectDenied(s.a.request(`mutation { delete_visits_by_pk(id: "${visit.id}") { id } }`), 'delete_visits_by_pk');
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, 0);
    expect(await sessionVisit(s.visitor.identity)).toBe(visit.id);
    await runSql(`DELETE FROM itap.visits WHERE id = '${visit.id}'`);
    expect(await sessionVisit(s.visitor.identity)).toBeNull();
    expect((await sessions(s.visitor.identity))[0].status).toBe('active');
  });
});

describe('visit editing', () => {
  it('should allow editing a visit only while it is scheduled', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const other = await personOfType(s.a, 'employee');
    await updateByPk(s.a, 'visits', visit.id, { host_profile_id: other.profile, expected_end: at(2 * HOUR), purpose: 'Moved' });
    expect(await visitById(visit.id)).toMatchObject({ host_profile_id: other.profile, purpose: 'Moved' });
    await visitFn(s.a, 'check_in_visit', visit.id);
    expect(await updateByPk(s.a, 'visits', visit.id, { purpose: 'Late edit' })).toBeNull();
    expect((await visitById(visit.id)).purpose).toBe('Moved');
    await visitFn(s.a, 'check_out_visit', visit.id);
    expect(await updateByPk(s.a, 'visits', visit.id, { badge_number: 'X' })).toBeNull();
  });
});

describe('visit functions', () => {
  it('should check in, check out and cancel with validated transitions', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const early = await expectError(visitFn(s.a, 'check_out_visit', visit.id));
    expect(early.message).toContain('visit_invalid_transition');
    const before = Date.now();
    const inn = await visitFn(s.a, 'check_in_visit', visit.id, { p_badge_number: 'B-12' });
    expect(inn).toMatchObject({ status: 'checked_in', badge_number: 'B-12' });
    expect(Math.abs(Date.parse(inn.checked_in_at ?? '') - before)).toBeLessThan(60_000);
    expect((await expectError(visitFn(s.a, 'check_in_visit', visit.id))).message).toContain('visit_invalid_transition');
    expect((await expectError(visitFn(s.a, 'cancel_visit', visit.id, { p_reason: 'x' }))).message).toContain(
      'visit_invalid_transition',
    );
    const out = await visitFn(s.a, 'check_out_visit', visit.id);
    expect(out.status).toBe('checked_out');
    expect(out.checked_out_at).not.toBeNull();
    expect((await expectError(visitFn(s.a, 'check_out_visit', visit.id))).message).toContain('visit_invalid_transition');

    const second = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const cancelled = await visitFn(s.a, 'cancel_visit', second.id, { p_reason: 'Host sick' });
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellation_reason: 'Host sick' });
    expect((await expectError(visitFn(s.a, 'check_in_visit', second.id))).message).toContain('visit_invalid_transition');
  });

  it('should only act on visits of the session organization', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const b = asOrgAdmin(s.other.id, s.orgB.id);
    expect((await expectError(visitFn(b, 'check_in_visit', visit.id))).message).toContain('visit_not_found');
    expect((await visitById(visit.id)).status).toBe('scheduled');
  });
});

describe('Stage A visit linking', () => {
  it('should link a scheduled visit within [expected_start - 2h, expected_end] and nothing outside', async () => {
    const s = await setup();
    const v = await createVisit(s.a, s.visitor.profile, 10 * HOUR, 12 * HOUR);
    const early = await personOfType(s.a, 'visitor');
    const inWindow = await personOfType(s.a, 'visitor');
    const late = await personOfType(s.a, 'visitor');
    const tooEarly = await personOfType(s.a, 'visitor');
    await createVisit(s.a, early.profile, 10 * HOUR, 12 * HOUR);
    await createVisit(s.a, inWindow.profile, 10 * HOUR, 12 * HOUR);
    await createVisit(s.a, late.profile, 10 * HOUR, 12 * HOUR);
    await createVisit(s.a, tooEarly.profile, 10 * HOUR, 12 * HOUR);
    await detect(s.orgA.id, s.lobbyCam, early.identity, 8 * HOUR);
    await detect(s.orgA.id, s.lobbyCam, inWindow.identity, 11 * HOUR);
    await detect(s.orgA.id, s.lobbyCam, late.identity, 12 * HOUR + 1);
    await detect(s.orgA.id, s.lobbyCam, tooEarly.identity, 8 * HOUR - 1);
    expect(await sessionVisit(early.identity)).not.toBeNull();
    expect(await sessionVisit(inWindow.identity)).not.toBeNull();
    expect(await sessionVisit(late.identity)).toBeNull();
    expect(await sessionVisit(tooEarly.identity)).toBeNull();
    expect(v.id).toBeTruthy();
  });

  it('should link a checked-in visit regardless of the window, preferring it over a scheduled one', async () => {
    const s = await setup();
    const scheduled = await createVisit(s.a, s.visitor.profile, -HOUR, 5 * HOUR);
    const checkedIn = await createVisit(s.a, s.visitor.profile, 20 * HOUR, 21 * HOUR);
    await visitFn(s.a, 'check_in_visit', checkedIn.id);
    // check-in happened (replayed) before the detection; the visit window itself is far away
    await runSql(`UPDATE itap.visits SET checked_in_at = '${at(0)}' WHERE id = '${checkedIn.id}'`);
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, HOUR);
    expect(await sessionVisit(s.visitor.identity)).toBe(checkedIn.id);
    expect(scheduled.id).not.toBe(checkedIn.id);
  });

  it('should match the facility only when the visit has none or the same one', async () => {
    const s = await setup();
    const elsewhere = await createFacility(s.a);
    const mismatch = await personOfType(s.a, 'visitor');
    const same = await personOfType(s.a, 'visitor');
    await createVisit(s.a, mismatch.profile, -HOUR, HOUR, { facility_id: elsewhere.id });
    const matching = await createVisit(s.a, same.profile, -HOUR, HOUR, { facility_id: s.facility.id });
    await detect(s.orgA.id, s.lobbyCam, mismatch.identity, 0);
    await detect(s.orgA.id, s.lobbyCam, same.identity, 0);
    expect(await sessionVisit(mismatch.identity)).toBeNull();
    expect(await sessionVisit(same.identity)).toBe(matching.id);
  });

  it('should not link cancelled or no_show visits, non-visitor identities or later extensions of a session', async () => {
    const s = await setup();
    const cancelled = await createVisit(s.a, s.visitor.profile, -HOUR, HOUR);
    await visitFn(s.a, 'cancel_visit', cancelled.id, { p_reason: 'x' });
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, 0);
    expect(await sessionVisit(s.visitor.identity)).toBeNull();
    const staff = await personOfType(s.a, 'employee');
    await detect(s.orgA.id, s.lobbyCam, staff.identity, 0);
    expect(await sessionVisit(staff.identity)).toBeNull();
    // A visit scheduled after the session opened is not retro-linked by further detections.
    await createVisit(s.a, s.visitor.profile, -HOUR, HOUR);
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, 30);
    expect(await sessionVisit(s.visitor.identity)).toBeNull();
  });

  it('should link by time for a replayed checked-out visit', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, 4 * HOUR);
    await visitFn(s.a, 'check_in_visit', visit.id);
    await visitFn(s.a, 'check_out_visit', visit.id);
    await runSql(
      `UPDATE itap.visits SET checked_in_at = '${at(HOUR)}', checked_out_at = '${at(2 * HOUR)}' WHERE id = '${visit.id}'`,
    );
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, HOUR + 60);
    expect(await sessionVisit(s.visitor.identity)).toBe(visit.id);
  });
});

describe('Stage A checked-in bound', () => {
  it('should not link a checked-in visit more than 4 hours after expected_end, nor before check-in', async () => {
    const s = await setup();
    const visit = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    await visitFn(s.a, 'check_in_visit', visit.id);
    // check-in time is now(); replay the checked_in_at into the past to exercise the bound.
    await runSql(`UPDATE itap.visits SET checked_in_at = '${at(0)}' WHERE id = '${visit.id}'`);
    await detect(s.orgA.id, s.lobbyCam, s.visitor.identity, HOUR + 4 * HOUR - 1);
    expect(await sessionVisit(s.visitor.identity)).toBe(visit.id);
    const late = await personOfType(s.a, 'visitor');
    const lateVisit = await createVisit(s.a, late.profile, 0, HOUR);
    await visitFn(s.a, 'check_in_visit', lateVisit.id);
    await runSql(`UPDATE itap.visits SET checked_in_at = '${at(0)}' WHERE id = '${lateVisit.id}'`);
    await detect(s.orgA.id, s.lobbyCam, late.identity, HOUR + 4 * HOUR + 1);
    expect(await sessionVisit(late.identity)).toBeNull();
    const before = await personOfType(s.a, 'visitor');
    const beforeVisit = await createVisit(s.a, before.profile, 0, HOUR);
    await visitFn(s.a, 'check_in_visit', beforeVisit.id);
    await runSql(`UPDATE itap.visits SET checked_in_at = '${at(100)}' WHERE id = '${beforeVisit.id}'`);
    await detect(s.orgA.id, s.lobbyCam, before.identity, 50);
    expect(await sessionVisit(before.identity)).toBeNull();
  });
});

describe('run_lifecycle_jobs', () => {
  const NOW = '2026-03-10T03:00:00Z';

  it('should mark never-checked-in visits past expected_end as no_show, once', async () => {
    const s = await setup();
    const past = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    const future = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    await runSql(`UPDATE itap.visits SET expected_end = '2026-03-11T00:00:00Z' WHERE id = '${future.id}'`);
    const checkedIn = await createVisit(s.a, s.visitor.profile, 0, HOUR);
    await visitFn(s.a, 'check_in_visit', checkedIn.id);
    expect((await runLifecycle(s.orgA.id, NOW)).map((r) => r.id)).toEqual([past.id]);
    expect((await visitById(past.id)).status).toBe('no_show');
    expect((await visitById(future.id)).status).toBe('scheduled');
    expect((await visitById(checkedIn.id)).status).toBe('checked_in');
    expect(await runLifecycle(s.orgA.id, NOW)).toEqual([]);
    expect(await runLifecycle(s.orgB.id, NOW)).toEqual([]);
  });

  it('should deactivate expired visitor/contractor profiles by organization date and expire invitations', async () => {
    const s = await setup();
    await runSql(`UPDATE itap.organizations SET timezone = 'Pacific/Auckland' WHERE id = '${s.orgA.id}'`);
    // 2026-03-10T03:00Z is 2026-03-10 16:00 in Auckland (NZDT, +13): end_date 2026-03-09 has passed, 03-10 has not.
    const expired = await insertOne(s.a, 'profiles', { first_name: 'A', last_name: 'B', profile_type: 'contractor', end_date: '2026-03-09' });
    const lastDay = await insertOne(s.a, 'profiles', { first_name: 'A', last_name: 'B', profile_type: 'visitor', end_date: '2026-03-10' });
    const employee = await insertOne(s.a, 'profiles', { first_name: 'A', last_name: 'B', profile_type: 'employee', end_date: '2026-03-01' });
    const suspended = await insertOne(s.a, 'profiles', { first_name: 'A', last_name: 'B', profile_type: 'visitor', end_date: '2026-03-01', status: 'suspended' });
    await runSql(
      `INSERT INTO itap.organization_invitations (organization_id, email, token_hash, expires_at, invited_by)
       VALUES ('${s.orgA.id}', 'old@example.com', 'h-${s.orgA.id}-1', '2026-03-09T00:00:00Z', '${s.user.id}'),
              ('${s.orgA.id}', 'new@example.com', 'h-${s.orgA.id}-2', '2026-03-12T00:00:00Z', '${s.user.id}')`,
    );
    await runLifecycle(s.orgA.id, NOW);
    const status = async (id: string) => (await runSqlRows(`SELECT status FROM itap.profiles WHERE id = '${id}'`))[0].status;
    expect(await status(expired.id)).toBe('inactive');
    expect(await status(lastDay.id)).toBe('active');
    expect(await status(employee.id)).toBe('active');
    expect(await status(suspended.id)).toBe('suspended');
    const inv = await runSqlRows(
      `SELECT email, status FROM itap.organization_invitations WHERE organization_id = '${s.orgA.id}' ORDER BY email`,
    );
    expect(inv).toEqual([
      { email: 'new@example.com', status: 'pending' },
      { email: 'old@example.com', status: 'expired' },
    ]);
    // Idempotent; the next local day deactivates the last-day profile.
    await runLifecycle(s.orgA.id, NOW);
    expect(await status(expired.id)).toBe('inactive');
    await runLifecycle(s.orgA.id, '2026-03-10T12:00:00Z');
    expect(await status(lastDay.id)).toBe('inactive');
  });

  it('should archive unlinked unverified identities unseen for archive_unknown_after_days, once', async () => {
    const s = await setup();
    await runSql(`UPDATE itap.organization_settings SET archive_unknown_after_days = 30 WHERE organization_id = '${s.orgA.id}'`);
    const mk = async (set: string): Promise<string> => {
      const i = await insertOne(s.a, 'identities', {});
      await runSql(`UPDATE itap.identities SET ${set} WHERE id = '${i.id}'`);
      return i.id;
    };
    const old = '2026-01-01T00:00:00Z';
    const stale = await mk(`last_seen_at = '${old}'`);
    const staleNeverSeen = await mk(`created_at = '${old}'`);
    const stalePending = await mk(`status = 'pending_verification', last_seen_at = '${old}'`);
    const recent = await mk(`last_seen_at = '2026-02-20T00:00:00Z'`);
    const suspended = await mk(`status = 'suspended', last_seen_at = '${old}'`);
    const linked = await mk(`profile_id = '${s.host.profile}', last_seen_at = '${old}'`);
    const verified = await mk(`status = 'verified', last_seen_at = '${old}'`);
    const foreign = await insertOne(asOrgAdmin(s.other.id, s.orgB.id), 'identities', {});
    await runSql(`UPDATE itap.identities SET last_seen_at = '${old}' WHERE id = '${foreign.id}'`);
    // Synthetic sandbox identities (slice 9) are never seen by cameras: never archived as unknown faces.
    const [synthetic] = await runSqlRows(
      `INSERT INTO itap.identities (organization_id, is_synthetic, created_at) VALUES ('${s.orgA.id}', true, '${old}') RETURNING id`,
    );
    const status = async (id: string) => (await runSqlRows(`SELECT status FROM itap.identities WHERE id = '${id}'`))[0].status;
    // 2026-03-10 minus 30 days = 2026-02-08.
    await runLifecycle(s.orgA.id, NOW);
    expect(await status(stale)).toBe('archived');
    expect(await status(staleNeverSeen)).toBe('archived');
    expect(await status(stalePending)).toBe('archived');
    expect(await status(recent)).toBe('unverified');
    expect(await status(suspended)).toBe('suspended');
    expect(await status(linked)).toBe('unverified');
    expect(await status(verified)).toBe('verified');
    expect(await status(foreign.id)).toBe('unverified');
    expect(await status(String(synthetic.id))).toBe('unverified');
    const updated = (await runSqlRows(`SELECT updated_at FROM itap.identities WHERE id = '${stale}'`))[0].updated_at;
    await runLifecycle(s.orgA.id, NOW);
    expect((await runSqlRows(`SELECT updated_at FROM itap.identities WHERE id = '${stale}'`))[0].updated_at).toBe(updated);
  });

  it('should leave other organizations alone and be callable with the admin secret only', async () => {
    const s = await setup();
    const foreign = asOrgAdmin(s.other.id, s.orgB.id);
    const old = await insertOne(foreign, 'profiles', { first_name: 'A', last_name: 'B', profile_type: 'visitor', end_date: '2026-03-01' });
    await runLifecycle(s.orgA.id, NOW);
    expect((await runSqlRows(`SELECT status FROM itap.profiles WHERE id = '${old.id}'`))[0].status).toBe('active');
    await expectDenied(
      s.a.request(`mutation { run_lifecycle_jobs(args: {p_organization: "${s.orgA.id}", p_at: "${NOW}"}) { id } }`),
      'run_lifecycle_jobs',
    );
  });
});
