import { stringify } from 'yaml';
import type { FunctionMetadata, FunctionSpec, TableSpec } from '../metadata-src/types.js';

const GENERATED_PREFIX = 'itap_';
const TENANT_ROLE = 'org_admin';
const SESSION_ARGUMENT = 'hasura_session';

/** One non-trigger function in a managed schema, as introspected from pg_proc. */
export interface FunctionRow {
  schema: string;
  name: string;
  /** pg_proc.provolatile: immutable / stable / volatile. */
  volatility: 'i' | 's' | 'v';
  /** Input arguments only (IN / INOUT / VARIADIC), aligned with argTypes; unnamed arguments are ''. */
  argNames: string[];
  argTypes: string[];
  returnsSet: boolean;
  /** Set when the function returns a table row type (`SETOF t` or `t`). */
  returnSchema: string | null;
  returnTable: string | null;
}

const qualified = (schema: string | null | undefined, name: string): string => `${schema ?? 'itap'}.${name}`;

export function functionFileName(spec: FunctionSpec): string {
  return `${spec.schema ?? 'itap'}_${spec.name}.yaml`;
}

/** True when the table's metadata grants `role` a select permission (generated tenant profile or extra entry). */
function canSelect(table: TableSpec, role: string): boolean {
  if (table.profile !== 'none' && role === TENANT_ROLE) return true;
  return (table.extraPermissions?.select_permissions ?? []).some((p) => p.role === role);
}

function validate(spec: FunctionSpec, rows: FunctionRow[], tables: TableSpec[]): void {
  const id = qualified(spec.schema, spec.name);
  const matches = rows.filter((r) => qualified(r.schema, r.name) === id);
  if (matches.length === 0) throw new Error(`Function ${id}: not found in the database`);
  if (matches.length > 1) throw new Error(`Function ${id}: overloaded (Hasura cannot track overloaded functions)`);
  const [row] = matches;

  const sessionIndex = row.argNames.indexOf(SESSION_ARGUMENT);
  if (!spec.sessionArgument && sessionIndex >= 0 && row.argTypes[sessionIndex] === 'json') {
    throw new Error(
      `Function ${id}: has a json "${SESSION_ARGUMENT}" argument but the spec omits sessionArgument ` +
        `(Hasura would expose it as a client-supplied argument)`,
    );
  }
  if (spec.sessionArgument) {
    const index = row.argNames.indexOf(spec.sessionArgument);
    if (index < 0) throw new Error(`Function ${id}: session argument "${spec.sessionArgument}" not found`);
    if (row.argTypes[index] !== 'json') {
      throw new Error(`Function ${id}: session argument "${spec.sessionArgument}" must be json (got ${row.argTypes[index]})`);
    }
  }
  if (row.volatility === 'v' && spec.exposedAs !== 'mutation') {
    throw new Error(`Function ${id}: volatile functions must be exposed as a mutation`);
  }
  if (!row.returnTable) throw new Error(`Function ${id}: must return a table row type (SETOF <table>)`);

  const returnId = qualified(row.returnSchema, row.returnTable);
  const table = tables.find((t) => qualified(t.schema, t.name) === returnId);
  if (!table) throw new Error(`Function ${id}: return table ${returnId} has no spec in metadata-src`);
  for (const role of spec.roles) {
    if (!canSelect(table, role)) {
      throw new Error(`Function ${id}: role "${role}" has no select permission on ${returnId} (the return table)`);
    }
  }
}

export function buildFunctionMetadata(spec: FunctionSpec): FunctionMetadata {
  return {
    function: { schema: spec.schema ?? 'itap', name: spec.name },
    configuration: {
      custom_name: spec.customName ?? spec.name,
      exposed_as: spec.exposedAs,
      ...(spec.sessionArgument ? { session_argument: spec.sessionArgument } : {}),
    },
    ...(spec.roles.length > 0 ? { permissions: [...spec.roles].sort().map((role) => ({ role })) } : {}),
  };
}

/** Builds `{ fileName: yaml }` for every function spec; throws on spec/database mismatch. */
export function planFunctionMetadata(specs: FunctionSpec[], tables: TableSpec[], rows: FunctionRow[]): Map<string, string> {
  const rootNames = new Set<string>();
  for (const spec of specs) {
    const root = spec.customName ?? spec.name;
    if (rootNames.has(root)) throw new Error(`Duplicate function root field name "${root}"`);
    rootNames.add(root);
    validate(spec, rows, tables);
  }
  const files = new Map<string, string>();
  for (const spec of [...specs].sort((a, b) => functionFileName(a).localeCompare(functionFileName(b)))) {
    files.set(functionFileName(spec), stringify(buildFunctionMetadata(spec), { lineWidth: 0 }));
  }
  return files;
}

export function isGeneratedFunctionFile(fileName: string): boolean {
  return fileName.startsWith(GENERATED_PREFIX) && fileName.endsWith('.yaml');
}

/** Keeps hand-written `!include` lines in order, then appends generated ones sorted; inline entries are an error. */
export function rewriteFunctionsYaml(existing: string, generatedFiles: string[]): string {
  const lines = existing
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && line !== '[]');
  const kept: string[] = [];
  for (const line of lines) {
    const match = /^- "!include (.+)"$/.exec(line);
    if (!match) {
      throw new Error(`functions.yaml has an inline entry ("${line.trim()}"); move it to a FunctionSpec in metadata-src`);
    }
    if (!isGeneratedFunctionFile(match[1])) kept.push(line);
  }
  const all = [...kept, ...[...generatedFiles].sort().map((f) => `- "!include ${f}"`)];
  return all.length > 0 ? `${all.join('\n')}\n` : '[]\n';
}
