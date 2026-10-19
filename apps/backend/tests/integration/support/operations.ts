import type { HasuraClient } from '../../../src/hasura/client.js';

/** GraphQL helpers for watch lists, event rules and incidents (slice 4, task 2). */

export async function insertOne<T = { id: string }>(
  client: HasuraClient,
  table: string,
  object: Record<string, unknown>,
  fields = 'id',
): Promise<T> {
  const data = await client.request<Record<string, T>>(
    `mutation($o: ${table}_insert_input!) { insert_${table}_one(object: $o) { ${fields} } }`,
    { o: object },
  );
  return data[`insert_${table}_one`];
}

export async function updateByPk<T = { id: string }>(
  client: HasuraClient,
  table: string,
  id: string,
  set: Record<string, unknown>,
  fields = 'id',
): Promise<T | null> {
  const data = await client.request<Record<string, T | null>>(
    `mutation($id: uuid!, $s: ${table}_set_input!) { update_${table}_by_pk(pk_columns: {id: $id}, _set: $s) { ${fields} } }`,
    { id, s: set },
  );
  return data[`update_${table}_by_pk`];
}

export async function deleteByPk(client: HasuraClient, table: string, id: string): Promise<{ id: string } | null> {
  const data = await client.request<Record<string, { id: string } | null>>(
    `mutation($id: uuid!) { delete_${table}_by_pk(id: $id) { id } }`,
    { id },
  );
  return data[`delete_${table}_by_pk`];
}

/** Calls a tracked mutation function `name(args: {...})` and returns its first row. */
export async function callFn<T = Record<string, unknown>>(
  client: HasuraClient,
  name: string,
  args: Record<string, unknown>,
  fields: string,
): Promise<T> {
  const data = await client.request<Record<string, T[]>>(
    `mutation($args: ${name}_args!) { ${name}(args: $args) { ${fields} } }`,
    { args },
  );
  return data[name][0];
}

export type Version = {
  id: string;
  rule_id: string;
  version: number;
  status: string;
  severity: string;
  parameters: Record<string, unknown>;
  creates_incident: boolean;
  published_by: string | null;
  published_at: string | null;
};
export const VERSION_FIELDS = 'id rule_id version status severity parameters creates_incident published_by published_at';

/** A rule (header) with one draft version scoped to the facility. */
export async function createRuleWithDraft(
  client: HasuraClient,
  facilityId: string,
  ruleType = 'after_hours',
): Promise<{ rule: { id: string; code: string }; draft: Version }> {
  const rule = await insertOne<{ id: string; code: string }>(
    client,
    'event_rules',
    { name: `Rule ${Math.random().toString(36).slice(2, 10)}`, rule_type: ruleType },
    'id code',
  );
  const draft = await insertOne<Version>(
    client,
    'event_rule_versions',
    {
      rule_id: rule.id,
      severity: 'high',
      parameters: { grace_minutes: 5 },
      creates_incident: true,
      event_rule_version_scopes: { data: [{ facility_id: facilityId }] },
    },
    VERSION_FIELDS,
  );
  return { rule, draft };
}

export type Incident = {
  id: string;
  code: string;
  status: string;
  disposition: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: string | null;
  escalation_step: number;
  last_escalated_at: string | null;
  assigned_to: string | null;
};
export const INCIDENT_FIELDS = `id code status disposition acknowledged_by acknowledged_at resolved_by resolved_at resolution
  escalation_step last_escalated_at assigned_to`;

export async function createIncident(client: HasuraClient, object: Record<string, unknown> = {}): Promise<Incident> {
  return insertOne<Incident>(client, 'incidents', { title: 'Tailgating at door 1', severity: 'high', ...object }, INCIDENT_FIELDS);
}

export type Activity = { kind: string; actor_id: string | null; details: Record<string, unknown> };

export async function activities(client: HasuraClient, incidentId: string): Promise<Activity[]> {
  const data = await client.request<{ incident_activities: Activity[] }>(
    `query($id: uuid!) { incident_activities(where: {incident_id: {_eq: $id}}, order_by: [{occurred_at: asc}, {created_at: asc}]) {
      kind actor_id details } }`,
    { id: incidentId },
  );
  return data.incident_activities;
}
