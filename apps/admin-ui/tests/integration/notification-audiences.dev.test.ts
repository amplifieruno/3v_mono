import { type DataProvider, type MutationContext, createMutationDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  ESCALATION_GROUP_STEP_RESOURCE,
  ESCALATION_POLICY_RESOURCE,
  ON_CALL_SCHEDULE_MEMBER_RESOURCE,
  RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE,
  RECIPIENT_GROUP_USER_MEMBER_RESOURCE,
} from '../../src/data/resource-names';
import { addressProblem } from '../../src/modules/notifications/recipient-group-members';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Recipient groups, escalation policies and on-call schedules against the dev stack (Nova,
 * `org_admin`), on a group, a policy and a schedule the test creates and deletes (members and
 * steps go with them). A group member with neither a user nor an address is refused (Review Focus
 * 2), as is an address that does not fit its channel; a step with both targets or on a webhook is
 * refused; the console's member and step resources write their own rows; who is on call now is
 * the rotation as the escalation cron computes it.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'notification-audiences-dev-test', scopeKey: null, bindingRevision: '1' } as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

type Row = Record<string, unknown>;

describe.skipIf(!DEV_STACK_ENABLED)('recipient groups, escalation and on-call against the dev stack', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let groupId = '';
  let policyId = '';
  let scheduleId = '';
  let members: string[] = [];

  const send = async (query: string, variables: Row = {}): Promise<{ data?: Row; errors?: { message: string }[] }> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as { data?: Row; errors?: { message: string }[] };
  };

  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const body = await send(query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  const create = (resource: string, input: Row) =>
    provider.mutations?.createOne?.(
      createMutationDescriptor({ ...IDENTITY, ref: { namespace: 'default', id: resource }, resource, idField: 'id', kind: 'createOne', input } as never) as never,
      context(),
    ) as Promise<{ record: Row }>;

  const update = (resource: string, id: string, input: Row) =>
    provider.mutations?.updateOne?.(
      createMutationDescriptor({ ...IDENTITY, ref: { namespace: 'default', id: resource }, resource, idField: 'id', kind: 'updateOne', id, input } as never) as never,
      context(),
    ) as Promise<{ record: Row }>;

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const suffix = crypto.randomUUID().slice(0, 8);
    const made = await graphql(
      `mutation ($group: String!, $policy: String!, $schedule: String!, $start: timestamptz!) {
        group: insert_recipient_groups_one(object: { name: $group }) { id }
        policy: insert_escalation_policies_one(object: { name: $policy, repeat: true, max_cycles: 2 }) { id }
        schedule: insert_on_call_schedules_one(object: { name: $schedule, shift_length_hours: 1, rotation_start_at: $start }) { id }
      }`,
      {
        group: `Dev test group ${suffix}`,
        policy: `Dev test policy ${suffix}`,
        schedule: `Dev test on-call ${suffix}`,
        // 90 minutes ago with 1-hour shifts: the second shift is running and ends in 30 minutes.
        start: new Date(Date.now() - 90 * 60_000).toISOString(),
      },
    );
    groupId = String((made.group as Row).id);
    policyId = String((made.policy as Row).id);
    scheduleId = String((made.schedule as Row).id);
    const active = await graphql('{ organization_members(where: { status: { _eq: active }, expires_at: { _is_null: true } }, limit: 2, order_by: { user_id: asc }) { user_id } }');
    members = (active.organization_members as Row[]).map((row) => String(row.user_id));
  }, 60_000);

  afterAll(async () => {
    if (policyId !== '') await graphql('mutation ($id: uuid!) { delete_escalation_policies_by_pk(id: $id) { id } }', { id: policyId });
    if (scheduleId !== '') await graphql('mutation ($id: uuid!) { delete_on_call_schedules_by_pk(id: $id) { id } }', { id: scheduleId });
    if (groupId !== '') await graphql('mutation ($id: uuid!) { delete_recipient_groups_by_pk(id: $id) { id } }', { id: groupId });
  }, 60_000);

  it('should refuse a group member with neither a user nor an address (Review Focus 2)', async () => {
    const neither = await send(
      'mutation ($group: uuid!) { insert_recipient_group_members_one(object: { group_id: $group, channel: email }) { id } }',
      { group: groupId },
    );
    expect(JSON.stringify(neither.errors)).toContain('recipient_group_members_exactly_one_recipient');
    await expect(create(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, { group_id: groupId, channel: 'email' })).rejects.toBeDefined();
  });

  it('should add a person and an address through their own resources, and refuse an address unfit for its channel', async () => {
    expect(members.length).toBeGreaterThan(0);
    const person = await create(RECIPIENT_GROUP_USER_MEMBER_RESOURCE, { group_id: groupId, user_id: members[0], channel: 'push' });
    expect(person.record.user_id).toBe(members[0]);
    const address = await create(RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE, { group_id: groupId, external_address: '+441632960123', channel: 'sms' });
    expect(address.record.external_address).toBe('+441632960123');

    expect(addressProblem('ops@example.com', 'sms')).toBe('phone');
    const unfit = await send(
      'mutation ($group: uuid!) { insert_recipient_group_members_one(object: { group_id: $group, external_address: "ops@example.com", channel: sms }) { id } }',
      { group: groupId },
    );
    expect(JSON.stringify(unfit.errors)).toContain('recipient_group_members_address_format');
  });

  it('should refuse a step with both targets or on a webhook, and accept a group step', async () => {
    const both = await send(
      `mutation ($policy: uuid!, $group: uuid!, $schedule: uuid!) {
        insert_escalation_policy_steps_one(object: { policy_id: $policy, step_no: 1, recipient_group_id: $group, on_call_schedule_id: $schedule, channel: email }) { id }
      }`,
      { policy: policyId, group: groupId, schedule: scheduleId },
    );
    expect(JSON.stringify(both.errors)).toContain('escalation_policy_steps_exactly_one_target');
    const webhook = await send(
      'mutation ($policy: uuid!, $group: uuid!) { insert_escalation_policy_steps_one(object: { policy_id: $policy, step_no: 1, recipient_group_id: $group, channel: webhook }) { id } }',
      { policy: policyId, group: groupId },
    );
    expect(JSON.stringify(webhook.errors)).toContain('escalation_policy_steps_channel_not_webhook');
    const step = await create(ESCALATION_GROUP_STEP_RESOURCE, { policy_id: policyId, step_no: 10, after_minutes: 5, recipient_group_id: groupId, channel: 'in_app' });
    expect(step.record).toMatchObject({ step_no: 10, after_minutes: 5, recipient_group_id: groupId });
  });

  it('should clear the number of passes when the policy stops repeating, as the form sends it', async () => {
    const before = await graphql('query ($id: uuid!) { escalation_policies_by_pk(id: $id) { repeat max_cycles } }', { id: policyId });
    expect(before.escalation_policies_by_pk).toEqual({ repeat: true, max_cycles: 2 });
    // The edit form writes only the fields it shows: no max_cycles once Repeat is off.
    await update(ESCALATION_POLICY_RESOURCE, policyId, { repeat: false });
    const after = await graphql('query ($id: uuid!) { escalation_policies_by_pk(id: $id) { repeat max_cycles } }', { id: policyId });
    expect(after.escalation_policies_by_pk).toEqual({ repeat: false, max_cycles: null });
  });

  it('should say who is on call now as the escalation cron computes it', async () => {
    expect(members.length, 'two active members in Nova').toBe(2);
    await create(ON_CALL_SCHEDULE_MEMBER_RESOURCE, { schedule_id: scheduleId, position: 0, user_id: members[0] });
    await create(ON_CALL_SCHEDULE_MEMBER_RESOURCE, { schedule_id: scheduleId, position: 10, user_id: members[1] });
    const read = await graphql('query ($id: uuid!) { on_call_schedules_by_pk(id: $id) { rotation_start_at on_call_user_id shift_ends_at } }', { id: scheduleId });
    const row = read.on_call_schedules_by_pk as Row;
    // Shift 1 (the second, 60–120 minutes after the start) belongs to position 10.
    expect(row.on_call_user_id).toBe(members[1]);
    expect(Date.parse(String(row.shift_ends_at))).toBe(Date.parse(String(row.rotation_start_at)) + 2 * 3_600_000);
  });
});
