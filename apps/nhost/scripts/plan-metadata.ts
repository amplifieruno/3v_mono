import { stringify } from 'yaml';
import type { ForeignKey, ManagedSchema, TableSpec } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';
import { assertTenantForeignKeys, markOneToOne } from './check-foreign-keys.js';
import { assertUniqueEventTriggerNames } from './build-trigger-metadata.js';

export interface ColumnRow {
  schema: ManagedSchema;
  table: string;
  column: string;
  /** Generated or identity-always column (never writable). */
  generated?: boolean;
}

export interface IndexRow {
  schema: ManagedSchema;
  table: string;
  name: string;
  /** Key columns in index order (no INCLUDE columns). Partial and expression indexes are not introspected. */
  columns: string[];
  /** Unique index, primary key or unique constraint. */
  unique: boolean;
}

export interface Introspection {
  columns: ColumnRow[];
  /** FKs from managed schemas into managed schemas or auth.users / storage.files (`schema`/`refSchema` set). */
  foreignKeys: ForeignKey[];
  indexes: IndexRow[];
}

const GENERATED_PREFIX = 'itap_';

/** Nhost-owned tables that itap tables may reference; only the object end is generated. */
export const EXTERNAL_TARGETS = new Set(['auth.users', 'storage.files']);

const qualified = (schema: string | undefined, table: string): string => `${schema ?? 'itap'}.${table}`;

export function metadataFileName(spec: TableSpec): string {
  return `${spec.schema ?? 'itap'}_${spec.name}.yaml`;
}

export function isGeneratedFile(fileName: string): boolean {
  return fileName.startsWith(GENERATED_PREFIX) && fileName.endsWith('.yaml');
}

function validate(specs: TableSpec[], columnsByTable: Map<string, string[]>): void {
  const names = new Set<string>();
  for (const spec of specs) {
    if (names.has(spec.name)) throw new Error(`Duplicate spec name "${spec.name}" (custom_name must be unique)`);
    names.add(spec.name);
    if (!columnsByTable.has(qualified(spec.schema, spec.name))) {
      throw new Error(`Spec "${qualified(spec.schema, spec.name)}" has no table in the database`);
    }
  }
  const specced = new Set(specs.map((s) => qualified(s.schema, s.name)));
  const missing = [...columnsByTable.keys()].filter((t) => !specced.has(t)).sort();
  if (missing.length > 0) {
    throw new Error(`Tables without a spec in metadata-src: ${missing.join(', ')}`);
  }
}

/** Builds `{ fileName: yaml }` for every spec; throws on spec/database mismatch. */
export function planMetadata(specs: TableSpec[], intro: Introspection): Map<string, string> {
  const columnsByTable = new Map<string, string[]>();
  const generatedByTable = new Map<string, string[]>();
  for (const row of intro.columns) {
    const key = qualified(row.schema, row.table);
    columnsByTable.set(key, [...(columnsByTable.get(key) ?? []), row.column]);
    if (row.generated) generatedByTable.set(key, [...(generatedByTable.get(key) ?? []), row.column]);
  }
  validate(specs, columnsByTable);
  assertUniqueEventTriggerNames(specs);
  assertTenantForeignKeys(intro);

  // FKs into enum tables get no relationships: Hasura exposes the column as a GraphQL enum instead.
  const relatable = new Set(specs.filter((s) => !s.isEnum).map((s) => qualified(s.schema, s.name)));
  const fks = markOneToOne(intro).filter(
    (fk) =>
      relatable.has(qualified(fk.schema, fk.table)) &&
      (relatable.has(qualified(fk.refSchema, fk.refTable)) ||
        EXTERNAL_TARGETS.has(qualified(fk.refSchema, fk.refTable))),
  );

  const files = new Map<string, string>();
  for (const spec of [...specs].sort((a, b) => metadataFileName(a).localeCompare(metadataFileName(b)))) {
    const key = qualified(spec.schema, spec.name);
    const metadata = buildTableMetadata(
      spec,
      columnsByTable.get(key) ?? [],
      fks.filter((fk) => qualified(fk.schema, fk.table) === key),
      fks.filter((fk) => qualified(fk.refSchema, fk.refTable) === key),
      generatedByTable.get(key) ?? [],
    );
    files.set(metadataFileName(spec), stringify(metadata, { lineWidth: 0, aliasDuplicateObjects: false }));
  }
  return files;
}

/** Keeps every non-generated include line (auth_*, storage_*) in order, then appends generated ones sorted. */
export function rewriteTablesYaml(existing: string, generatedFiles: string[]): string {
  const kept = existing
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && line !== '[]')
    .filter((line) => {
      const match = /^- "!include (.+)"$/.exec(line);
      return !(match && isGeneratedFile(match[1]));
    });
  const generated = [...generatedFiles].sort().map((f) => `- "!include ${f}"`);
  const lines = [...kept, ...generated];
  return lines.length > 0 ? `${lines.join('\n')}\n` : '[]\n';
}
