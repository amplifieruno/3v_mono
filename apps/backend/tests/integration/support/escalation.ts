import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';
import { createIncident, insertOne } from './operations.js';
import { runSql } from './sql.js';

/** Escalation and digest fixtures (slice 5, task 4). */

/**
 * Incident times are in the future (Monday 2030-01-07 08:00 UTC), so the live `escalate` cron (scheduled_time = now)
 * never finds them due while a test drives escalation with explicit instants.
 */
export const T0 = '2030-01-07T08:00:00.000Z';
export const minutes = (m: number, from = T0): string => new Date(Date.parse(from) + m * 60_000).toISOString();

export type Step = { after_minutes: number; channel: string; recipient_group_id?: string; on_call_schedule_id?: string };

export async function escalationPolicy(a: HasuraClient, steps: Step[], repeat = false): Promise<{ id: string; steps: string[] }> {
  const policy = await insertOne<{ id: string; escalation_policy_steps: { id: string; step_no: number }[] }>(
    a,
    'escalation_policies',
    {
      name: `Policy ${Math.random().toString(36).slice(2, 10)}`,
      repeat,
      // step_no 10, 20, ... (gaps allowed: order is what counts)
      escalation_policy_steps: { data: steps.map((s, i) => ({ step_no: (i + 1) * 10, ...s })) },
    },
    'id escalation_policy_steps(order_by: {step_no: asc}) { id step_no }',
  );
  return { id: policy.id, steps: policy.escalation_policy_steps.map((s) => s.id) };
}

/** An open incident under `policy` whose created_at (= event time) is `createdAt`. */
export async function escalationIncident(
  a: HasuraClient,
  orgId: string,
  policy: string | null,
  createdAt = T0,
  fields: Record<string, unknown> = {},
): Promise<string> {
  // Created without a policy, then policy and time set in ONE statement: the live escalate cron never sees the
  // incident with a policy but its real (current) created_at.
  const incident = await createIncident(a, { escalation_policy_id: null, severity: 'critical', ...fields });
  const policySql = policy === null ? 'NULL' : `'${policy}'`;
  await runSql(`update itap.incidents set escalation_policy_id = ${policySql}, created_at = '${createdAt}'
    where organization_id = '${orgId}' and id = '${incident.id}'`);
  return incident.id;
}

export type Escalated = { id: string; escalation_step: number; last_escalated_at: string | null };

/** itap.escalate_incidents for one organization at `at` (what the cron handler calls); the escalated incidents. */
export async function escalate(orgId: string, at: string): Promise<Escalated[]> {
  const data = await asAdmin().request<{ escalate_incidents: Escalated[] }>(
    `mutation($o: uuid!, $t: timestamptz!) {
      escalate_incidents(args: {p_organization: $o, p_at: $t}) { id escalation_step last_escalated_at } }`,
    { o: orgId, t: at },
  );
  return data.escalate_incidents;
}

export async function incidentState(id: string): Promise<Escalated & { status: string }> {
  const data = await asAdmin().request<{ incidents_by_pk: Escalated & { status: string } }>(
    `query($id: uuid!) { incidents_by_pk(id: $id) { id status escalation_step last_escalated_at } }`,
    { id },
  );
  return data.incidents_by_pk;
}

export type EscalationDelivery = {
  id: string;
  escalation_step_id: string;
  escalation_cycle: number;
  incident_id: string | null;
  recipient_user_id: string | null;
  recipient_address: string | null;
  channel: string;
  priority: string;
  status: string;
  deliver_after: string | null;
  content: Record<string, unknown>;
};

export async function escalationDeliveries(orgId: string, incidentId?: string): Promise<EscalationDelivery[]> {
  const data = await asAdmin().request<{ notification_deliveries: EscalationDelivery[] }>(
    `query($o: uuid!, $i: uuid_comparison_exp!) { notification_deliveries(
      where: {organization_id: {_eq: $o}, escalation_step_id: {_is_null: false}, incident_id: $i},
      order_by: [{created_at: asc}, {escalation_cycle: asc}, {recipient_key: asc}]) {
        id escalation_step_id escalation_cycle incident_id recipient_user_id recipient_address channel priority status
        deliver_after content } }`,
    { o: orgId, i: incidentId ? { _eq: incidentId } : {} },
  );
  return data.notification_deliveries;
}

/** [step id, cycle, recipient] of escalation deliveries, in creation order. */
export const trail = (rows: EscalationDelivery[]): [string, number, string][] =>
  rows.map((d) => [d.escalation_step_id, d.escalation_cycle, d.recipient_user_id ?? d.recipient_address ?? '']);

export type DigestDelivery = {
  id: string;
  rule_id: string | null;
  event_id: string | null;
  recipient_user_id: string | null;
  recipient_address: string | null;
  channel: string;
  priority: string;
  status: string;
  deliver_after: string | null;
  digested_into: string | null;
  content: Record<string, unknown>;
};

export async function ruleDeliveries(orgId: string, ruleId: string): Promise<DigestDelivery[]> {
  const data = await asAdmin().request<{ notification_deliveries: DigestDelivery[] }>(
    `query($o: uuid!, $r: uuid!) { notification_deliveries(where: {organization_id: {_eq: $o}, rule_id: {_eq: $r}},
      order_by: [{created_at: asc}, {id: asc}]) {
        id rule_id event_id recipient_user_id recipient_address channel priority status deliver_after digested_into content } }`,
    { o: orgId, r: ruleId },
  );
  return data.notification_deliveries;
}

/** itap.send_digests for one organization at `at`; the combined deliveries written. */
export async function sendDigests(orgId: string, at: string): Promise<{ id: string }[]> {
  const data = await asAdmin().request<{ send_digests: { id: string }[] }>(
    `mutation($o: uuid!, $t: timestamptz!) { send_digests(args: {p_organization: $o, p_at: $t}) { id } }`,
    { o: orgId, t: at },
  );
  return data.send_digests;
}

/** An on-call schedule rotating `users` every `shiftHours` from `start`. */
export async function onCallSchedule(a: HasuraClient, users: string[], start = T0, shiftHours = 1): Promise<string> {
  const s = await insertOne(a, 'on_call_schedules', {
    name: `On call ${Math.random().toString(36).slice(2, 10)}`,
    timezone: 'UTC',
    shift_length_hours: shiftHours,
    rotation_start_at: start,
    on_call_schedule_members: { data: users.map((user_id, i) => ({ user_id, position: i })) },
  });
  return s.id;
}
