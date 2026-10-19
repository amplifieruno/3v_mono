import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectError } from './support/fixtures.js';
import { insertOne } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

const START = '2026-01-05T08:00:00Z'; // rotation_start_at
const hours = (h: number) => new Date(Date.parse(START) + h * 3_600_000).toISOString();

async function schedule(shiftHours = 12, memberCount = 3) {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const s = await insertOne(a, 'on_call_schedules', { name: 'oc', timezone: 'UTC', shift_length_hours: shiftHours, rotation_start_at: START });
  const users = [user];
  for (let i = 1; i < memberCount; i++) {
    const u = await createTestUser();
    await addMember(orgA.id, u.id);
    users.push(u);
  }
  // positions 10, 20, 30 ... (gaps are fine; order is what counts)
  for (const [i, u] of users.entries()) {
    await insertOne(a, 'on_call_schedule_members', { schedule_id: s.id, user_id: u.id, position: (i + 1) * 10 });
  }
  return { orgA, orgB, user, other, a, s, users };
}

async function onCall(scheduleId: string, at: string): Promise<string | null> {
  const [row] = await runSqlRows(`select itap.on_call_member('${scheduleId}', '${at}'::timestamptz) as u`);
  return row.u === 'NULL' ? null : row.u;
}

describe('itap.on_call_member', () => {
  it('should rotate by position every shift_length_hours from rotation_start_at and wrap around', async () => {
    const x = await schedule(12, 3);
    const [u0, u1, u2] = x.users.map((u) => u.id);
    expect(await onCall(x.s.id, hours(0))).toBe(u0);
    expect(await onCall(x.s.id, hours(11.99))).toBe(u0);
    expect(await onCall(x.s.id, hours(12))).toBe(u1);
    expect(await onCall(x.s.id, hours(24))).toBe(u2);
    expect(await onCall(x.s.id, hours(36))).toBe(u0);
    expect(await onCall(x.s.id, hours(12 * 3 * 100 + 25))).toBe(u2);
  });

  it('should rotate backwards for instants before the start', async () => {
    const x = await schedule(12, 3);
    const [u0, , u2] = x.users.map((u) => u.id);
    expect(await onCall(x.s.id, hours(-0.01))).toBe(u2);
    expect(await onCall(x.s.id, hours(-12))).toBe(u2);
    expect(await onCall(x.s.id, hours(-36))).toBe(u0);
  });

  it('should skip a deactivated member without moving the others, and wrap past the last position', async () => {
    const x = await schedule(12, 3);
    const [u0, u1, u2] = x.users.map((u) => u.id);
    await runSqlRows(`update itap.organization_members set status='deactivated', deactivated_at=now() where organization_id='${x.orgA.id}' and user_id='${u1}'`);
    expect(await onCall(x.s.id, hours(0))).toBe(u0);
    expect(await onCall(x.s.id, hours(12))).toBe(u2); // u1's shift goes to the next active member
    expect(await onCall(x.s.id, hours(24))).toBe(u2);
    await runSqlRows(`update itap.organization_members set status='suspended' where organization_id='${x.orgA.id}' and user_id='${u2}'`);
    expect(await onCall(x.s.id, hours(24))).toBe(u0); // wraps past the end
    expect(await onCall(x.s.id, hours(12))).toBe(u0);
  });

  it('should skip a member whose membership has expired at the queried instant (deterministic on p_at)', async () => {
    const x = await schedule(12, 3);
    const [u0, u1, u2] = x.users.map((u) => u.id);
    await runSqlRows(`update itap.organization_members set expires_at='${hours(10)}' where organization_id='${x.orgA.id}' and user_id='${u1}'`);
    expect(await onCall(x.s.id, hours(12))).toBe(u2); // u1 expired at hour 10
    await runSqlRows(`update itap.organization_members set expires_at='${hours(13)}' where organization_id='${x.orgA.id}' and user_id='${u1}'`);
    expect(await onCall(x.s.id, hours(12.5))).toBe(u1); // not yet expired at p_at
    expect(await onCall(x.s.id, hours(13))).toBe(u2); // expires_at <= p_at is expired
    await runSqlRows(`update itap.organization_members set expires_at='${hours(10)}' where organization_id='${x.orgA.id}' and user_id='${u1}'`);
    expect(await onCall(x.s.id, hours(9))).toBe(u0);
    await runSqlRows(`update itap.organization_members set expires_at='${hours(24)}' where organization_id='${x.orgA.id}' and user_id='${u2}'`);
    expect(await onCall(x.s.id, hours(24))).toBe(u0); // u2 expires exactly at the instant: wraps to u0
    expect(await onCall(x.s.id, hours(23.99))).toBe(u2);
  });

  it('should return NULL for no active member, no members or an unknown schedule', async () => {
    const x = await schedule(24, 1);
    expect(await onCall(x.s.id, hours(5))).toBe(x.users[0].id);
    await runSqlRows(`update itap.organization_members set status='suspended' where organization_id='${x.orgA.id}' and user_id='${x.user.id}'`);
    expect(await onCall(x.s.id, hours(5))).toBeNull();
    const empty = await insertOne(x.a, 'on_call_schedules', { name: 'empty', timezone: 'UTC', shift_length_hours: 8, rotation_start_at: START });
    expect(await onCall(empty.id, hours(5))).toBeNull();
    expect(await onCall('00000000-0000-0000-0000-000000000000', hours(5))).toBeNull();
  });
});

describe('on-call schedule configuration', () => {
  it('should validate timezone, shift length and unique positions and members', async () => {
    const x = await schedule(8, 2);
    const base = { timezone: 'UTC', shift_length_hours: 8, rotation_start_at: START };
    expect((await expectError(insertOne(x.a, 'on_call_schedules', { ...base, name: 'a', timezone: 'Mars/Base' }))).message).toMatch(/on_call_schedules_timezone_valid/);
    expect((await expectError(insertOne(x.a, 'on_call_schedules', { ...base, name: 'b', shift_length_hours: 0 }))).message).toMatch(/on_call_schedules_shift_length_positive/);
    const dupPos = await expectError(insertOne(x.a, 'on_call_schedule_members', { schedule_id: x.s.id, user_id: (await newMember(x)).id, position: 10 }));
    expect(dupPos.message).toMatch(/on_call_schedule_members_organization_id_schedule_id_position_key|Uniqueness/i);
    const dupUser = await expectError(insertOne(x.a, 'on_call_schedule_members', { schedule_id: x.s.id, user_id: x.user.id, position: 99 }));
    expect(dupUser.message).toMatch(/on_call_schedule_members_organization_id_schedule_id_user_id_key|Uniqueness/i);
  });

  it('should only accept active members of the own organization', async () => {
    const x = await schedule(8, 1);
    const gone = await createTestUser();
    await addMember(x.orgA.id, gone.id, 'deactivated');
    expect((await expectError(insertOne(x.a, 'on_call_schedule_members', { schedule_id: x.s.id, user_id: gone.id, position: 50 }))).message).toMatch(/member_not_active:user_id/);
    expect((await expectError(insertOne(x.a, 'on_call_schedule_members', { schedule_id: x.s.id, user_id: x.other.id, position: 51 }))).message).toMatch(/foreign key/i);
  });

  it('should isolate schedules between organizations', async () => {
    const x = await schedule(8, 1);
    const b = asOrgAdmin(x.other.id, x.orgB.id);
    const seen = await b.request<{ on_call_schedules: unknown[]; on_call_schedule_members: unknown[] }>(
      `query { on_call_schedules { id } on_call_schedule_members { id } }`,
    );
    expect(seen).toEqual({ on_call_schedules: [], on_call_schedule_members: [] });
  });
});

async function newMember(x: { orgA: { id: string } }) {
  const u = await createTestUser();
  await addMember(x.orgA.id, u.id);
  return u;
}
