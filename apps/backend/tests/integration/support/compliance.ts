import type { HasuraClient } from '../../../src/hasura/client.js';
import { callFn } from './operations.js';
import { runSqlRows } from './sql.js';

/** Helpers for the compliance schema (slice 10 task 1). */

export const RESTRICTION_FIELDS = 'id processing_restricted restricted_at restricted_by restriction_reason';

export type Restriction = {
  id: string;
  processing_restricted: boolean;
  restricted_at: string | null;
  restricted_by: string | null;
  restriction_reason: string | null;
};

/** itap.set_processing_restriction as the given client (org_admin). */
export function setRestriction(client: HasuraClient, profile: string, restricted: boolean, reason = 'Data subject request'): Promise<Restriction> {
  return callFn<Restriction>(
    client,
    'set_processing_restriction',
    { p_profile: profile, p_restricted: restricted, p_reason: reason },
    RESTRICTION_FIELDS,
  );
}

/** Evaluates a boolean / scalar SQL expression (admin) and returns its text value. */
export async function sqlValue(expression: string): Promise<string | null> {
  const [row] = await runSqlRows(`select (${expression})::text as v`);
  const v = row?.v ?? null;
  return v === 'NULL' ? null : v;
}

export const sqlBool = async (expression: string): Promise<boolean> => (await sqlValue(expression)) === 'true';

/** Ids returned by a set-returning SQL function call (admin), sorted. */
export async function sqlIds(call: string): Promise<string[]> {
  const rows = await runSqlRows(`select x::text as id from ${call} x order by 1`);
  return rows.map((r) => String(r.id));
}

/** Inserts a legal hold (SQL, admin) with one target; returns the hold id. */
export async function sqlHold(
  org: string,
  target: { identity_id?: string; profile_id?: string; incident_id?: string; facility_id?: string },
  window: { starts?: string; ends?: string | null } = {},
): Promise<string> {
  const [hold] = await runSqlRows(
    `insert into itap.legal_holds (organization_id, name, reason, starts_at, ends_at)
     values ('${org}', 'Hold ${Date.now().toString(36)}', 'Litigation', ${window.starts ?? 'now()'}, ${window.ends ?? 'null'})
     returning id`,
  );
  const [column, id] = Object.entries(target)[0];
  await runSqlRows(
    `insert into itap.legal_hold_targets (organization_id, hold_id, ${column}) values ('${org}', '${hold.id}', '${id}')`,
  );
  return String(hold.id);
}
