import type { ExternalSchema, ForeignKey, ManagedSchema } from '../metadata-src/types.js';
import type { FunctionRow } from './build-function-metadata.js';
import type { ColumnRow, IndexRow, Introspection } from './plan-metadata.js';

export const MANAGED_SCHEMAS: ManagedSchema[] = ['itap', 'itap_results'];

export interface HasuraAdmin {
  endpoint: string; // e.g. http://localhost:8080 (no path)
  adminSecret: string;
}

const SCHEMA_LIST = MANAGED_SCHEMAS.map((s) => `'${s}'`).join(', ');

// Tables, partitioned parents, views and materialized views; partitions are excluded (not tracked).
const COLUMNS_SQL = `
select coalesce(json_agg(json_build_object('schema', n.nspname, 'table', c.relname, 'column', a.attname,
    'generated', a.attgenerated <> '' or a.attidentity = 'a')
  order by n.nspname, c.relname, a.attname), '[]'::json)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname in (${SCHEMA_LIST}) and c.relkind in ('r', 'p', 'v', 'm') and not c.relispartition`;

// FKs from managed schemas into managed schemas or auth.users / storage.files; column order follows conkey/confkey.
const FOREIGN_KEYS_SQL = `
select coalesce(json_agg(json_build_object(
  'schema', n.nspname, 'table', c.relname, 'constraint', con.conname,
  'columns', (select json_agg(a.attname order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
  'refSchema', rn.nspname, 'refTable', rc.relname,
  'refColumns', (select json_agg(a.attname order by k.ord)
                 from unnest(con.confkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
) order by n.nspname, c.relname, con.conname), '[]'::json)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_class rc on rc.oid = con.confrelid
join pg_namespace rn on rn.oid = rc.relnamespace
where con.contype = 'f' and not c.relispartition
  and n.nspname in (${SCHEMA_LIST})
  and (rn.nspname in (${SCHEMA_LIST}) or (rn.nspname, rc.relname) in (('auth', 'users'), ('storage', 'files')))`;

// Plain (non-partial, non-expression) indexes incl. primary keys and unique constraints; key columns in order.
const INDEXES_SQL = `
select coalesce(json_agg(json_build_object(
  'schema', n.nspname, 'table', c.relname, 'name', ic.relname, 'unique', i.indisunique,
  'columns', (select json_agg(a.attname order by k.ord)
              from unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
              where k.ord <= i.indnkeyatts)
) order by n.nspname, c.relname, ic.relname), '[]'::json)
from pg_index i
join pg_class c on c.oid = i.indrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_class ic on ic.oid = i.indexrelid
where n.nspname in (${SCHEMA_LIST}) and not c.relispartition
  and i.indpred is null and 0 <> all (i.indkey::int2[])`;

// Non-trigger functions in managed schemas with all argument names/modes/types (OUT and TABLE columns included;
// toFunction keeps the input arguments) and the returned table (if any).
const FUNCTIONS_SQL = `
select coalesce(json_agg(json_build_object(
  'schema', n.nspname, 'name', p.proname, 'volatility', p.provolatile,
  'argNames', coalesce(to_json(p.proargnames), '[]'::json),
  'argModes', to_json(p.proargmodes),
  'argTypes', (select coalesce(json_agg(format_type(t.oid, null) order by k.ord), '[]'::json)
               from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality k(oid, ord)
               join pg_type t on t.oid = k.oid),
  'returnsSet', p.proretset, 'returnSchema', rn.nspname, 'returnTable', rc.relname
) order by n.nspname, p.proname), '[]'::json)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_type rt on rt.oid = p.prorettype
left join pg_class rc on rc.oid = rt.typrelid and rc.relkind in ('r', 'p', 'v', 'm')
left join pg_namespace rn on rn.oid = rc.relnamespace
where n.nspname in (${SCHEMA_LIST}) and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype`;

type RunSqlResponse = { result_type?: string; result?: string[][]; error?: string; code?: string };

async function runJsonSql(admin: HasuraAdmin, sql: string): Promise<unknown> {
  const res = await fetch(`${admin.endpoint.replace(/\/+$/, '')}/v2/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': admin.adminSecret },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql, read_only: true } }),
  });
  const text = await res.text();
  let body: RunSqlResponse;
  try {
    body = JSON.parse(text) as RunSqlResponse;
  } catch {
    throw new Error(`run_sql: HTTP ${res.status}, non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!res.ok || body.error) {
    throw new Error(
      `run_sql failed (HTTP ${res.status}, ${body.code ?? 'unknown'}): ${body.error ?? text.slice(0, 200)}`,
    );
  }
  const cell = body.result?.[1]?.[0];
  if (typeof cell !== 'string') throw new Error(`run_sql: unexpected result shape: ${text.slice(0, 200)}`);
  return JSON.parse(cell) as unknown;
}

function isManagedSchema(value: unknown): value is ManagedSchema {
  return typeof value === 'string' && (MANAGED_SCHEMAS as string[]).includes(value);
}

function isRefSchema(value: unknown): value is ManagedSchema | ExternalSchema {
  return isManagedSchema(value) || value === 'auth' || value === 'storage';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function asRecords(value: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'object' && v !== null)) {
    throw new Error(`Introspection: ${what} is not an array of objects`);
  }
  return value as Record<string, unknown>[];
}

function toColumn(row: Record<string, unknown>): ColumnRow {
  const { schema, table, column, generated } = row;
  if (
    !isManagedSchema(schema) ||
    typeof table !== 'string' ||
    typeof column !== 'string' ||
    typeof generated !== 'boolean'
  ) {
    throw new Error(`Introspection: bad column row ${JSON.stringify(row)}`);
  }
  return generated ? { schema, table, column, generated } : { schema, table, column };
}

function toForeignKey(row: Record<string, unknown>): ForeignKey {
  const { schema, table, constraint, columns, refSchema, refTable, refColumns } = row;
  if (
    !isManagedSchema(schema) ||
    !isRefSchema(refSchema) ||
    typeof table !== 'string' ||
    typeof refTable !== 'string' ||
    typeof constraint !== 'string' ||
    !isStringArray(columns) ||
    !isStringArray(refColumns) ||
    columns.length !== refColumns.length
  ) {
    throw new Error(`Introspection: bad foreign key row ${JSON.stringify(row)}`);
  }
  return { schema, table, constraint, columns, refSchema, refTable, refColumns };
}

function toIndex(row: Record<string, unknown>): IndexRow {
  const { schema, table, name, columns, unique } = row;
  if (
    !isManagedSchema(schema) ||
    typeof table !== 'string' ||
    typeof name !== 'string' ||
    typeof unique !== 'boolean' ||
    !isStringArray(columns)
  ) {
    throw new Error(`Introspection: bad index row ${JSON.stringify(row)}`);
  }
  return { schema, table, name, columns, unique };
}

const INPUT_MODES = new Set(['i', 'b', 'v']);

/**
 * Normalizes an introspected pg_proc row. `argTypes` covers all arguments (proallargtypes) and `argModes` is
 * proargmodes (null when every argument is IN); only input arguments (IN, INOUT, VARIADIC) are kept, so OUT and
 * TABLE columns cannot shift names against types.
 */
export function toFunction(row: Record<string, unknown>): FunctionRow {
  const { schema, name, volatility, argNames, argModes, argTypes, returnsSet, returnSchema, returnTable } = row;
  if (
    typeof schema !== 'string' ||
    typeof name !== 'string' ||
    (volatility !== 'i' && volatility !== 's' && volatility !== 'v') ||
    !isStringArray(argNames) ||
    !isStringArray(argTypes) ||
    (argModes !== null && argModes !== undefined && !(isStringArray(argModes) && argModes.length === argTypes.length)) ||
    argNames.length > argTypes.length ||
    typeof returnsSet !== 'boolean' ||
    (returnSchema !== null && typeof returnSchema !== 'string') ||
    (returnTable !== null && typeof returnTable !== 'string')
  ) {
    throw new Error(`Introspection: bad function row ${JSON.stringify(row)}`);
  }
  const inputs = argTypes.flatMap((type, i) =>
    !isStringArray(argModes) || INPUT_MODES.has(argModes[i]) ? [{ name: argNames[i] ?? '', type }] : [],
  );
  return {
    schema,
    name,
    volatility,
    argNames: inputs.map((a) => a.name),
    argTypes: inputs.map((a) => a.type),
    returnsSet,
    returnSchema,
    returnTable,
  };
}

export async function introspectFunctions(admin: HasuraAdmin): Promise<FunctionRow[]> {
  return asRecords(await runJsonSql(admin, FUNCTIONS_SQL), 'functions').map(toFunction);
}

export async function introspect(admin: HasuraAdmin): Promise<Introspection> {
  const [columns, foreignKeys, indexes] = await Promise.all([
    runJsonSql(admin, COLUMNS_SQL),
    runJsonSql(admin, FOREIGN_KEYS_SQL),
    runJsonSql(admin, INDEXES_SQL),
  ]);
  return {
    columns: asRecords(columns, 'columns').map(toColumn),
    foreignKeys: asRecords(foreignKeys, 'foreign keys').map(toForeignKey),
    indexes: asRecords(indexes, 'indexes').map(toIndex),
  };
}
