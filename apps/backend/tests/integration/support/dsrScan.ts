import { q } from './retention.js';
import { runSqlRows } from './sql.js';
import type { Subject } from './dsrWorld.js';

/** Introspection scans for the DSR erasure tests (slice 10 task 3, Review Focus 2). */

/** Text patterns (ILIKE) of the person: ids, names, contacts. */
export function subjectPatterns(s: Subject, withProfileId = true): string[] {
  return [...(withProfileId ? [s.profile] : []), ...s.identities, ...identifierPatterns(s)].map((t) => (t.startsWith('%') ? t : `%${t}%`));
}

/** Direct identifiers only: names, contacts, employee id. */
export function identifierPatterns(s: Subject): string[] {
  return [s.first, s.last, s.email, s.phone, s.employee].map((t) => `%${t}%`);
}

const patternArray = (patterns: string[]): string => `ARRAY[${patterns.map((p) => q(p)).join(', ')}]::text[]`;

/** Rows per itap table whose whole-row text mentions any pattern (only tables with hits). */
export async function scanTables(patterns: string[]): Promise<Record<string, number>> {
  const rows = await runSqlRows(
    `select t.table_name as t,
            (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from itap.%I x where x::text ilike any (%L)',
              t.table_name, ${patternArray(patterns)}), false, true, '')))[1]::text::int as n
     from information_schema.tables t where t.table_schema = 'itap' and t.table_type = 'BASE TABLE' order by 1`,
  );
  return Object.fromEntries(rows.filter((r) => Number(r.n) > 0).map((r) => [String(r.t), Number(r.n)]));
}

/** Rows of `itap.<table>` mentioning a pattern, as JSON objects. */
export async function matchingRows(table: string, patterns: string[]): Promise<Record<string, unknown>[]> {
  const rows = await runSqlRows(`select to_jsonb(x)::text as j from itap.${table} x where x::text ilike any (${patternArray(patterns)})`);
  return rows.map((r) => JSON.parse(String(r.j)) as Record<string, unknown>);
}

/** Hasura event log rows (any state) mentioning a pattern. */
export async function eventLogHits(patterns: string[], deliveredOnly = false): Promise<number> {
  const [r] = await runSqlRows(
    `select count(*) as n from hdb_catalog.event_log e where e.payload::text ilike any (${patternArray(patterns)})
       ${deliveredOnly ? 'and (e.delivered or e.error or e.archived)' : ''}`,
  );
  return Number(r.n);
}

/** Storage rows of the bucket mentioning a pattern (name / metadata), plus the given files still present. */
export async function storageHits(org: string, patterns: string[], files: string[]): Promise<number> {
  const ids = files.length > 0 ? `or f.id in (${files.map((f) => q(f)).join(', ')})` : '';
  const [r] = await runSqlRows(
    `select count(*) as n from storage.files f where (f.bucket_id = '${org}' and (f.name ilike any (${patternArray(patterns)})
       or f.metadata::text ilike any (${patternArray(patterns)}))) ${ids}`,
  );
  return Number(r.n);
}

/** Structural identifiers of the person as the erasure matches them (lower case). */
export function subjectIds(s: Subject, withProfileId = false): string[] {
  return [...(withProfileId ? [s.profile] : []), ...s.identities, s.email, s.phone, s.employee].map((t) => t.toLowerCase());
}

/** Finished Hasura event log rows carrying one of the identifiers as a JSON value (structural match). */
export async function eventLogStructuralHits(ids: string[]): Promise<number> {
  const [r] = await runSqlRows(
    `select count(*) as n from hdb_catalog.event_log e where (e.delivered or e.error or e.archived)
       and itap.dsr_json_hit(e.payload, ${patternArray(ids)}, '{}'::text[])`,
  );
  return Number(r.n);
}

/**
 * Rows mentioning a pattern that are not held by a facility hold: tables other than the kept person records
 * (profiles, identities, audit, requests) must only keep rows of the held facility (directly, or through their
 * incident / event / access point).
 */
export async function unheldHits(patterns: string[], heldFacility: string): Promise<Record<string, number>> {
  const hits = await scanTables(patterns);
  const cols = await runSqlRows(
    `select table_name as t, string_agg(column_name, ',') as c from information_schema.columns
     where table_schema = 'itap' and column_name in ('facility_id', 'incident_id', 'event_id', 'access_point_id') group by 1`,
  );
  const colsOf = new Map(cols.map((r) => [String(r.t), String(r.c).split(',')]));
  const result: Record<string, number> = {};
  for (const table of Object.keys(hits)) {
    if (['profiles', 'identities', 'audit_log', 'data_subject_requests', 'dsr_steps'].includes(table)) continue;
    const c = colsOf.get(table) ?? [];
    const held = [
      ...(c.includes('facility_id') ? [`x.facility_id = '${heldFacility}'`] : []),
      ...(c.includes('incident_id')
        ? [`exists (select 1 from itap.incidents i where i.id = x.incident_id and i.facility_id = '${heldFacility}')`]
        : []),
      ...(c.includes('event_id')
        ? [`exists (select 1 from itap.events e where e.id = x.event_id and e.facility_id = '${heldFacility}')`]
        : []),
      ...(c.includes('access_point_id')
        ? [`exists (select 1 from itap.access_points p where p.id = x.access_point_id and p.facility_id = '${heldFacility}')`]
        : []),
    ];
    const [r] = await runSqlRows(
      `select count(*) as n from itap.${table} x where x::text ilike any (${patternArray(patterns)})
         ${held.length > 0 ? `and not (${held.map((h) => `coalesce(${h}, false)`).join(' or ')})` : ''}`,
    );
    if (Number(r.n) > 0) result[table] = Number(r.n);
  }
  return result;
}
