import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';
import { callFn, insertOne } from './operations.js';
import { at } from './tracking.js';

/** Visits (slice 4, task 4): helpers for profiles, visits and the visit mutation functions. */

export const VISIT_FIELDS = `id code status visitor_profile_id host_profile_id facility_id company_id purpose
  expected_start expected_end checked_in_at checked_out_at badge_number cancellation_reason`;
export type Visit = {
  id: string;
  code: string;
  status: string;
  visitor_profile_id: string;
  host_profile_id: string | null;
  facility_id: string | null;
  company_id: string | null;
  purpose: string | null;
  expected_start: string;
  expected_end: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  badge_number: string | null;
  cancellation_reason: string | null;
};

/** A profile of the given type and one identity linked to it. */
export async function personOfType(
  a: HasuraClient,
  profileType: string,
  extra: Record<string, unknown> = {},
): Promise<{ profile: string; identity: string }> {
  const p = await insertOne(a, 'profiles', { first_name: 'Vic', last_name: 'Tor', profile_type: profileType, ...extra });
  const i = await insertOne(a, 'identities', { profile_id: p.id });
  return { profile: p.id, identity: i.id };
}

/** Creates a visit between `startS` and `endS` seconds after the tracking base time (see `at`). */
export function createVisit(
  a: HasuraClient,
  visitor: string,
  startS: number,
  endS: number,
  extra: Record<string, unknown> = {},
): Promise<Visit> {
  return insertOne<Visit>(
    a,
    'visits',
    { visitor_profile_id: visitor, expected_start: at(startS), expected_end: at(endS), ...extra },
    VISIT_FIELDS,
  );
}

export const visitFn = (a: HasuraClient, name: string, visit: string, extra: Record<string, unknown> = {}): Promise<Visit> =>
  callFn<Visit>(a, name, { p_visit: visit, ...extra }, VISIT_FIELDS);

export async function visitById(id: string): Promise<Visit> {
  const data = await asAdmin().request<{ visits_by_pk: Visit }>(
    `query($id: uuid!) { visits_by_pk(id: $id) { ${VISIT_FIELDS} } }`,
    { id },
  );
  return data.visits_by_pk;
}

/** itap.run_lifecycle_jobs(org, at) — the daily cron's per-organization call; returns the visits it set to no_show. */
export async function runLifecycle(orgId: string, atIso: string): Promise<{ id: string; status: string }[]> {
  const data = await asAdmin().request<{ run_lifecycle_jobs: { id: string; status: string }[] }>(
    `mutation($o: uuid!, $t: timestamptz!) { run_lifecycle_jobs(args: {p_organization: $o, p_at: $t}) { id status } }`,
    { o: orgId, t: atIso },
  );
  return data.run_lifecycle_jobs;
}
