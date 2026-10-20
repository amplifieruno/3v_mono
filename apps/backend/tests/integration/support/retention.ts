import type { HasuraClient } from '../../../src/hasura/client.js';
import { createDevice, createFacility, type Facility } from './facilities.js';
import { createTwoOrgs } from './fixtures.js';
import { asOrgAdmin } from './clients.js';
import { runSql, runSqlRows } from './sql.js';

/** Helpers for the retention engine (slice 10 task 2). */

export type PurgeResult = { affected: number; skipped_by_hold: number; files_enqueued: number };

export type PurgeOptions = {
  facility?: string | null;
  subjectProfile?: string | null;
  subjectIdentity?: string | null;
  limit?: number;
  action?: 'delete' | 'anonymize' | 'archive';
};

const uuidOrNull = (v: string | null | undefined): string => (v ? `'${v}'::uuid` : 'null::uuid');

/** `now() - interval '<days> days'` (SQL expression). */
export const ago = (days: number): string => `now() - interval '${days} days'`;

/** One batch of itap.purge_class (admin). `cutoff` is a SQL expression. */
export async function purge(cls: string, org: string, cutoff: string, o: PurgeOptions = {}): Promise<PurgeResult> {
  const [r] = await runSqlRows(
    `select * from itap.purge_class('${cls}', '${org}', ${cutoff}, ${uuidOrNull(o.facility)},
       ${uuidOrNull(o.subjectProfile)}, ${uuidOrNull(o.subjectIdentity)}, ${o.limit ?? 1000}, '${o.action ?? 'delete'}')`,
  );
  return { affected: Number(r.affected), skipped_by_hold: Number(r.skipped_by_hold), files_enqueued: Number(r.files_enqueued) };
}

/** Repeats batches until one affects nothing; returns the summed result (skipped = last batch). */
export async function purgeAll(cls: string, org: string, cutoff: string, o: PurgeOptions = {}): Promise<PurgeResult> {
  const total: PurgeResult = { affected: 0, skipped_by_hold: 0, files_enqueued: 0 };
  for (let i = 0; i < 50; i += 1) {
    const r = await purge(cls, org, cutoff, o);
    total.affected += r.affected;
    total.files_enqueued += r.files_enqueued;
    total.skipped_by_hold = r.skipped_by_hold;
    if (r.affected === 0) return total;
  }
  throw new Error(`purgeAll(${cls}) did not drain`);
}

/** count(*) of a FROM/WHERE clause, e.g. `itap.events where organization_id = '…'`. */
export async function count(from: string): Promise<number> {
  const [r] = await runSqlRows(`select count(*)::int as n from ${from}`);
  return Number(r.n);
}

/** Runs SQL inside the retention context (same run_sql transaction). */
export function inRetentionContext(sql: string): Promise<void> {
  return runSql(`select set_config('itap.retention_context', 'on', true); ${sql}`);
}

/** Inserts a row with SQL and returns its id. */
export async function insertRow(table: string, values: Record<string, string>): Promise<string> {
  const cols = Object.keys(values);
  const [r] = await runSqlRows(
    `insert into itap.${table} (${cols.join(', ')}) values (${cols.map((c) => values[c]).join(', ')}) returning id`,
  );
  return String(r.id);
}

export const q = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/** A storage file row in the organization bucket (no object; the storage API answers 404 for it). */
export async function fileRow(org: string, kind = 'misc', extra: Record<string, string> = {}): Promise<string> {
  const [r] = await runSqlRows(
    `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded, metadata)
     values ('${org}', 'retention-${Date.now()}.bin', 'application/octet-stream', 1, true,
             '${JSON.stringify({ kind, ...extra })}'::jsonb) returning id`,
  );
  return String(r.id);
}

export async function queued(file: string): Promise<boolean> {
  return (await count(`itap.pending_file_deletions where file_id = '${file}'`)) === 1;
}

export type RetentionWorld = {
  org: string;
  orgB: string;
  userId: string;
  a: HasuraClient;
  facility: Facility;
  other: Facility;
};

/** Two organizations; org A with two facilities. */
export async function retentionWorld(): Promise<RetentionWorld> {
  const { orgA, orgB, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const other = await createFacility(a);
  return { org: orgA.id, orgB: orgB.id, userId: user.id, a, facility, other };
}

/** An identity (SQL; unlinked unless a profile is given). */
export async function sqlIdentity(org: string, extra: Record<string, string> = {}): Promise<string> {
  return insertRow('identities', { organization_id: q(org), ...extra });
}

export async function sqlProfile(org: string): Promise<string> {
  return insertRow('profiles', { organization_id: q(org), first_name: q('Ret'), last_name: q(`Subject ${Date.now()}`) });
}

/** An event of the organization at `days` ago. */
export function sqlEvent(org: string, days: number, extra: Record<string, string> = {}): Promise<string> {
  return insertRow('events', {
    organization_id: q(org),
    event_type: q('detection_known'),
    title: q('Known person detected'),
    occurred_at: ago(days),
    ...extra,
  });
}

/** A camera device of the facility (for detections). */
export async function camera(a: HasuraClient, facility: string): Promise<string> {
  return (await createDevice(a, facility)).id;
}

/** Active retention policy (SQL). */
export function sqlPolicy(org: string, cls: string, days: number, action = 'delete', facility: string | null = null): Promise<string> {
  return insertRow('retention_policies', {
    organization_id: q(org),
    data_class: q(cls),
    retain_days: String(days),
    action: q(action),
    facility_id: facility ? q(facility) : 'null',
  });
}
