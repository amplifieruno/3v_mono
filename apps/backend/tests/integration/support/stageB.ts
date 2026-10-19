import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';
import { insertOne } from './operations.js';
import { at } from './tracking.js';

/** Stage B (evaluate_detection), dwell / stale-session crons and their events (slice 4, task 3). */

export type EventRow = {
  id: string;
  event_type: string;
  severity: string;
  facility_id: string | null;
  area_id: string | null;
  access_point_id: string | null;
  device_id: string | null;
  identity_id: string | null;
  profile_id: string | null;
  detection_id: string | null;
  session_id: string | null;
  rule_version_id: string | null;
  title: string;
  payload: Record<string, unknown>;
  dedup_key: string | null;
  occurred_at: string;
};
export const EVENT_FIELDS = `id event_type severity facility_id area_id access_point_id device_id identity_id profile_id
  detection_id session_id rule_version_id title payload dedup_key occurred_at`;

/** Calls itap.evaluate_detection (admin-only mutation) and returns the events of the detection. */
export async function evaluate(detectionId: string): Promise<EventRow[]> {
  const data = await asAdmin().request<{ evaluate_detection: EventRow[] }>(
    `mutation($d: uuid!) { evaluate_detection(args: {p_detection: $d}) { ${EVENT_FIELDS} } }`,
    { d: detectionId },
  );
  return data.evaluate_detection;
}

/** All events of an organization, oldest first. */
export async function orgEvents(orgId: string): Promise<EventRow[]> {
  const data = await asAdmin().request<{ events: EventRow[] }>(
    `query($o: uuid!) { events(where: {organization_id: {_eq: $o}}, order_by: [{occurred_at: asc}, {event_type: asc}]) {
      ${EVENT_FIELDS} } }`,
    { o: orgId },
  );
  return data.events;
}

export const types = (events: EventRow[]): string[] => events.map((e) => e.event_type).sort();

/** A profile (with overrides) and one identity linked to it; returns both ids. */
export async function knownPerson(
  a: HasuraClient,
  profile: Record<string, unknown> = {},
): Promise<{ profile: string; identity: string }> {
  const p = await insertOne(a, 'profiles', { first_name: 'Ann', last_name: 'Lee', ...profile });
  const i = await insertOne(a, 'identities', { profile_id: p.id });
  return { profile: p.id, identity: i.id };
}

/** A rule of `ruleType` with one version (scopes as given; none = everywhere), published. Returns the version id. */
export async function publishedRule(
  a: HasuraClient,
  ruleType: string,
  version: Record<string, unknown> = {},
  scopes: Record<string, unknown>[] = [],
  name?: string,
): Promise<{ rule: string; version: string }> {
  const rule = await insertOne(a, 'event_rules', {
    name: name ?? `Rule ${Math.random().toString(36).slice(2, 10)}`,
    rule_type: ruleType,
  });
  const v = await insertOne(a, 'event_rule_versions', {
    rule_id: rule.id,
    severity: 'high',
    creates_incident: false,
    ...version,
    event_rule_version_scopes: { data: scopes },
  });
  await a.request(`mutation($v: uuid!) { publish_event_rule_version(args: {p_version: $v}) { id } }`, { v: v.id });
  return { rule: rule.id, version: v.id };
}

export type IncidentView = {
  id: string;
  title: string;
  severity: string;
  status: string;
  facility_id: string | null;
  area_id: string | null;
  incident_events: { event_id: string }[];
  incident_identities: { identity_id: string; role: string }[];
  incident_activities: { kind: string; details: Record<string, unknown> }[];
};

export async function orgIncidents(orgId: string): Promise<IncidentView[]> {
  const data = await asAdmin().request<{ incidents: IncidentView[] }>(
    `query($o: uuid!) { incidents(where: {organization_id: {_eq: $o}}, order_by: {number: asc}) {
      id title severity status facility_id area_id
      incident_events { event_id } incident_identities { identity_id role } incident_activities { kind details } } }`,
    { o: orgId },
  );
  return data.incidents;
}

/** itap.evaluate_dwell_rules(org, at) — the cron's per-organization call; returns the new events. */
export async function evaluateDwell(orgId: string, seconds: number): Promise<EventRow[]> {
  const data = await asAdmin().request<{ evaluate_dwell_rules: EventRow[] }>(
    `mutation($o: uuid!, $t: timestamptz!) { evaluate_dwell_rules(args: {p_organization: $o, p_at: $t}) { ${EVENT_FIELDS} } }`,
    { o: orgId, t: at(seconds) },
  );
  return data.evaluate_dwell_rules;
}

/** itap.close_stale_sessions(org, at) — the cron's per-organization call; returns the closed sessions. */
export async function closeStale(orgId: string, seconds: number): Promise<{ id: string; status: string }[]> {
  const data = await asAdmin().request<{ close_stale_sessions: { id: string; status: string }[] }>(
    `mutation($o: uuid!, $t: timestamptz!) { close_stale_sessions(args: {p_organization: $o, p_at: $t}) { id status } }`,
    { o: orgId, t: at(seconds) },
  );
  return data.close_stale_sessions;
}
