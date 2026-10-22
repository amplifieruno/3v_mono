import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_ON_CALL_STEP_RESOURCE,
  ESCALATION_POLICY_RESOURCE,
  ON_CALL_SCHEDULE_MEMBER_RESOURCE,
  ON_CALL_SCHEDULE_RESOURCE,
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
} from '../../src/data/resource-names';
import { ADDRESS_MEMBER_CHECKS, addressProblem } from '../../src/modules/notifications/recipient-group-members';
import { validatorResult } from '../support/field-issues';

/**
 * Recipient groups, escalation policies and on-call schedules without the UI. The exactly-one
 * columns (a member's user or address, a step's group or schedule) are two resources each, every
 * form offering and requiring its own column only, so a member with neither cannot be saved
 * (Review Focus 2); channels never offer a webhook; addresses fit their channel as the database
 * checks; positions, step numbers, minutes and passes are bounded as the CHECKs are; who is on call
 * is the server's answer, read only.
 */

type FieldDef = {
  readonly kind?: string;
  readonly values?: readonly string[];
  readonly system?: boolean;
  readonly opts?: { readonly required?: boolean; readonly validate?: unknown };
};
type Def = {
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly operations?: Record<string, boolean>;
  readonly section?: string;
};

const def = (name: string) => app.registry.get(name) as unknown as Def;
const field = (resource: string, name: string) => def(resource).fields[name];

beforeAll(async () => {
  await app.ready;
});

describe('recipient groups', () => {
  it('should be edited in full from the notifications section', () => {
    for (const name of [RECIPIENT_GROUP_RESOURCE, ESCALATION_POLICY_RESOURCE, ON_CALL_SCHEDULE_RESOURCE]) {
      expect(def(name).operations?.create, name).not.toBe(false);
      expect(def(name).operations?.edit, name).not.toBe(false);
      expect(def(name).operations?.delete, name).not.toBe(false);
    }
  });

  it('should require the recipient of each member form and offer no other (Review Focus 2)', () => {
    expect(field(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, 'user_id')?.opts?.required).toBe(true);
    expect(field(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, 'external_address')).toBeUndefined();
    expect(field(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, 'external_address')?.opts?.required).toBe(true);
    expect(field(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, 'user_id')).toBeUndefined();
  });

  it('should reach people on any channel but a webhook, and addresses by email or SMS', () => {
    expect(field(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, 'channel')?.values).toEqual(['in_app', 'email', 'sms', 'push']);
    expect(field(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, 'channel')?.values).toEqual(['email', 'sms']);
  });

  it('should check an address against its channel as the database does', () => {
    for (const ok of ['ops@example.com', 'a.b+c@mail.example.org']) expect(addressProblem(ok, 'email'), ok).toBeNull();
    for (const bad of ['ops', 'ops@example', 'two@@example.com', 'a b@example.com']) expect(addressProblem(bad, 'email'), bad).toBe('email');
    for (const ok of ['+441632960123', '+7495123456']) expect(addressProblem(ok, 'sms'), ok).toBeNull();
    for (const bad of ['441632960123', '+0441632960', '+44 1632 960123', '+12345']) expect(addressProblem(bad, 'sms'), bad).toBe('phone');
    // Nothing typed yet: the required rule speaks.
    expect(addressProblem('', 'sms')).toBeNull();
    const [email, phone] = ADDRESS_MEMBER_CHECKS.map((check) => check.when as (ctx: { values: Record<string, unknown> }) => boolean);
    expect(email?.({ values: { channel: 'email', external_address: '+441632960123' } })).toBe(true);
    expect(phone?.({ values: { channel: 'sms', external_address: 'ops@example.com' } })).toBe(true);
    expect(phone?.({ values: { channel: 'sms', external_address: '+441632960123' } })).toBe(false);
  });
});

describe('escalation policies', () => {
  it('should give each step kind its own required target and no other', () => {
    expect(field(ESCALATION_GROUP_STEP_RESOURCE, 'recipient_group_id')?.opts?.required).toBe(true);
    expect(field(ESCALATION_GROUP_STEP_RESOURCE, 'on_call_schedule_id')).toBeUndefined();
    expect(field(ESCALATION_ON_CALL_STEP_RESOURCE, 'on_call_schedule_id')?.opts?.required).toBe(true);
    expect(field(ESCALATION_ON_CALL_STEP_RESOURCE, 'recipient_group_id')).toBeUndefined();
  });

  it('should never page on a webhook', () => {
    for (const name of [ESCALATION_GROUP_STEP_RESOURCE, ESCALATION_ON_CALL_STEP_RESOURCE]) {
      expect(field(name, 'channel')?.values, name).toEqual(['in_app', 'email', 'sms', 'push']);
    }
  });

  it('should bound step numbers, minutes, passes and positions as the CHECKs do', async () => {
    const result = (resource: string, name: string, value: unknown) =>
      validatorResult(field(resource, name)?.opts?.validate as never, value);
    expect(await result(ESCALATION_GROUP_STEP_RESOURCE, 'step_no', 1)).toBeNull();
    expect(await result(ESCALATION_GROUP_STEP_RESOURCE, 'step_no', 0)).not.toBeNull();
    expect(await result(ESCALATION_ON_CALL_STEP_RESOURCE, 'after_minutes', 0)).toBeNull();
    expect(await result(ESCALATION_ON_CALL_STEP_RESOURCE, 'after_minutes', -5)).not.toBeNull();
    expect(await result(ESCALATION_ON_CALL_STEP_RESOURCE, 'after_minutes', 2.5)).not.toBeNull();
    expect(await result(ESCALATION_POLICY_RESOURCE, 'max_cycles', null)).toBeNull();
    expect(await result(ESCALATION_POLICY_RESOURCE, 'max_cycles', 0)).not.toBeNull();
    expect(await result(ON_CALL_SCHEDULE_MEMBER_RESOURCE, 'position', 0)).toBeNull();
    expect(await result(ON_CALL_SCHEDULE_MEMBER_RESOURCE, 'position', -1)).not.toBeNull();
    expect(await result(ON_CALL_SCHEDULE_RESOURCE, 'shift_length_hours', 0)).not.toBeNull();
  });
});

describe('on-call schedules', () => {
  it('should show who is on call now and until when, as the server computes it, never edited', () => {
    const now = field(ON_CALL_SCHEDULE_RESOURCE, 'on_call_user_id');
    expect(now?.kind).toBe('relation');
    expect(now?.system).toBe(true);
    expect(field(ON_CALL_SCHEDULE_RESOURCE, 'shift_ends_at')?.system).toBe(true);
  });

  it('should require the person and position of a rotation member', () => {
    expect(field(ON_CALL_SCHEDULE_MEMBER_RESOURCE, 'user_id')?.opts?.required).toBe(true);
    expect(field(ON_CALL_SCHEDULE_MEMBER_RESOURCE, 'position')?.opts?.required).toBe(true);
  });
});
