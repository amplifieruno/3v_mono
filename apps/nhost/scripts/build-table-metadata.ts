import type {
  BoolExp,
  ForeignKey,
  HasuraPermissions,
  ManualRelationship,
  RolePermission,
  SelectPermission,
  TableMetadata,
  TableSpec,
} from '../metadata-src/types.js';

const ORG_COLUMN = 'organization_id';
const TENANT_ROLE = 'org_admin';
const NEVER_WRITABLE = new Set(['id', ORG_COLUMN, 'created_at', 'updated_at', 'created_by']);
const ARRAY_OVERRIDE_SUFFIX = '#array';

/** Array-end stem: FK columns without `organization_id`, each minus `_id`; `organization` for the org FK. */
function fkStem(columns: string[]): string {
  const own = columns.filter((c) => c !== ORG_COLUMN);
  if (own.length === 0) return 'organization';
  return own.map((c) => c.replace(/_id$/, '')).join('_');
}

/** Naive English singular, enough for snake_case table names (`identities`, `statuses`, `boxes`, `cases`). */
export function singularize(word: string): string {
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(ss|us)es$/.test(word)) return word.slice(0, -2);
  if (/(x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Object-end name: the array stem; when an own FK column lacks the `_id` suffix (`assigned_to`, `created_by`),
 * append the singular of the referenced table's last segment (`organization_members` → `assigned_to_member`).
 */
function objectName(fk: ForeignKey): string {
  const own = fk.columns.filter((c) => c !== ORG_COLUMN);
  const stem = fkStem(fk.columns);
  if (own.length === 0 || own.every((c) => c.endsWith('_id'))) return stem;
  const segments = fk.refTable.split('_');
  return `${stem}_${singularize(segments[segments.length - 1])}`;
}

function mapping(from: string[], to: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  from.forEach((col, i) => {
    out[col] = to[i];
  });
  return out;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

type NamedRel = { rel: ManualRelationship; constraint: string };

function objectRelationships(spec: TableSpec, outgoing: ForeignKey[]): NamedRel[] {
  return outgoing.map((fk) => ({
    constraint: fk.constraint,
    rel: {
      name: spec.relationshipNames?.[fk.constraint] ?? objectName(fk),
      using: {
        manual_configuration: {
          remote_table: { schema: fk.refSchema ?? 'itap', name: fk.refTable },
          column_mapping: mapping(fk.columns, fk.refColumns),
        },
      },
    },
  }));
}

/** Reverse-side relationships (named after the child table); one-to-one FKs (`oneToOne`) become object ends. */
function reverseRelationships(spec: TableSpec, incoming: ForeignKey[]): (NamedRel & { oneToOne: boolean })[] {
  const childKey = (fk: ForeignKey): string => `${fk.schema ?? 'itap'}.${fk.table}`;
  const perChild = new Map<string, number>();
  for (const fk of incoming) perChild.set(childKey(fk), (perChild.get(childKey(fk)) ?? 0) + 1);

  const names = spec.relationshipNames ?? {};
  return incoming.map((fk) => {
    const derived = (perChild.get(childKey(fk)) ?? 0) > 1 ? `${fk.table}_by_${fkStem(fk.columns)}` : fk.table;
    return {
      constraint: fk.constraint,
      oneToOne: fk.oneToOne === true,
      rel: {
        name: names[fk.constraint + ARRAY_OVERRIDE_SUFFIX] ?? names[fk.constraint] ?? derived,
        using: {
          manual_configuration: {
            remote_table: { schema: fk.schema ?? 'itap', name: fk.table },
            column_mapping: mapping(fk.refColumns, fk.columns),
          },
        },
      },
    };
  });
}

function assertUniqueNames(spec: TableSpec, columns: string[], rels: NamedRel[]): void {
  const seen = new Map<string, string>();
  for (const { rel, constraint } of rels) {
    const clash = columns.includes(rel.name) ? `column "${rel.name}"` : seen.get(rel.name);
    if (clash) {
      throw new Error(
        `Table ${spec.name}: relationship "${rel.name}" from constraint ${constraint} collides with ${clash}; ` +
          `set relationshipNames["${constraint}"] (or "${constraint}${ARRAY_OVERRIDE_SUFFIX}" for the array end) in the spec`,
      );
    }
    seen.set(rel.name, `relationship from constraint ${constraint}`);
  }
}

function assertKnownOverrides(spec: TableSpec, outgoing: ForeignKey[], incoming: ForeignKey[]): void {
  const incomingNames = new Set(incoming.map((fk) => fk.constraint));
  const allNames = new Set([...outgoing.map((fk) => fk.constraint), ...incomingNames]);
  for (const key of Object.keys(spec.relationshipNames ?? {})) {
    const known = key.endsWith(ARRAY_OVERRIDE_SUFFIX)
      ? incomingNames.has(key.slice(0, -ARRAY_OVERRIDE_SUFFIX.length))
      : allNames.has(key);
    if (!known) throw new Error(`Table ${spec.name}: relationshipNames has unknown constraint "${key}"`);
  }
}

function assertKnownColumns(spec: TableSpec, columns: string[]): void {
  for (const col of [
    ...(spec.readOnlyColumns ?? []),
    ...(spec.insertOnlyColumns ?? []),
    ...(spec.secretColumns ?? []),
  ]) {
    if (!columns.includes(col)) throw new Error(`Table ${spec.name}: unknown column "${col}" in spec`);
  }
}

function assertComputedFields(spec: TableSpec, columns: string[]): void {
  const seen = new Set<string>();
  for (const field of spec.computedFields ?? []) {
    if (columns.includes(field.name) || seen.has(field.name)) {
      throw new Error(`Table ${spec.name}: computed field "${field.name}" collides with a column or another computed field`);
    }
    seen.add(field.name);
  }
}

function tenantPermissions(spec: TableSpec, columns: string[], generatedColumns: Set<string>): HasuraPermissions {
  const computed = (spec.computedFields ?? []).map((f) => f.name).sort();
  if (spec.profile === 'none') return {};
  if (!columns.includes(ORG_COLUMN)) {
    throw new Error(`Table ${spec.name}: profile ${spec.profile} requires an ${ORG_COLUMN} column`);
  }
  const filter: BoolExp = { [ORG_COLUMN]: { _eq: 'X-Hasura-Organization-Id' } };
  const secret = new Set(spec.secretColumns ?? []);
  const readOnly = new Set(spec.readOnlyColumns ?? []);
  const selectable = columns.filter((c) => !secret.has(c));
  const select: HasuraPermissions = {
    select_permissions: [
      {
        role: TENANT_ROLE,
        permission: {
          columns: selectable,
          ...(computed.length > 0 ? { computed_fields: computed } : {}),
          filter,
          allow_aggregations: true,
        },
      },
    ],
  };
  if (spec.profile === 'tenant_read') return select;

  const writable = columns.filter((c) => !readOnly.has(c) && !NEVER_WRITABLE.has(c) && !generatedColumns.has(c));
  const insertOnly = new Set(spec.insertOnlyColumns ?? []);
  const updatable = writable.filter((c) => !insertOnly.has(c));
  const set: Record<string, string> = { [ORG_COLUMN]: 'x-hasura-organization-id' };
  if (columns.includes('created_by')) set.created_by = 'x-hasura-user-id';

  return {
    ...(spec.noInsert
      ? {}
      : { insert_permissions: [{ role: TENANT_ROLE, permission: { columns: writable, check: filter, set } }] }),
    ...select,
    update_permissions: [{ role: TENANT_ROLE, permission: { columns: updatable, filter } }],
    ...(spec.noDelete ? {} : { delete_permissions: [{ role: TENANT_ROLE, permission: { filter } }] }),
  };
}

function mergeRoles<P>(base: RolePermission<P>[] = [], extra: RolePermission<P>[] = []): RolePermission<P>[] {
  const byRole = new Map<string, RolePermission<P>>();
  for (const entry of [...base, ...extra]) byRole.set(entry.role, entry);
  return [...byRole.values()].sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}

/** Extra select entries default to `allow_aggregations: true` (burojs needs `_aggregate { count }`). */
function withAggregations(extra: RolePermission<SelectPermission>[] = []): RolePermission<SelectPermission>[] {
  return extra.map((entry) => ({
    ...entry,
    permission: { ...entry.permission, allow_aggregations: entry.permission.allow_aggregations ?? true },
  }));
}

/** A replacing select entry keeps the generated entry's computed fields (union with its own). */
function withComputedFields(
  base: RolePermission<SelectPermission>[] = [],
  extra: RolePermission<SelectPermission>[] = [],
): RolePermission<SelectPermission>[] {
  return extra.map((entry) => {
    const generatedFields = base.find((b) => b.role === entry.role)?.permission.computed_fields ?? [];
    const merged = [...new Set([...generatedFields, ...(entry.permission.computed_fields ?? [])])].sort();
    return merged.length > 0 ? { ...entry, permission: { ...entry.permission, computed_fields: merged } } : entry;
  });
}

function nonEmpty<T>(list: T[]): T[] | undefined {
  return list.length > 0 ? list : undefined;
}

export function buildTableMetadata(
  spec: TableSpec,
  columns: string[],
  outgoing: ForeignKey[],
  incoming: ForeignKey[],
  /** Generated (`attgenerated`) and identity-always columns: never insertable/updatable. */
  generatedColumns: string[] = [],
): TableMetadata {
  if (spec.isEnum && spec.profile !== 'none') {
    throw new Error(`Table ${spec.name}: isEnum tables must use profile 'none' (got '${spec.profile}')`);
  }
  const sortedColumns = [...columns].sort();
  assertKnownColumns(spec, sortedColumns);
  assertKnownOverrides(spec, outgoing, incoming);
  assertComputedFields(spec, sortedColumns);

  const reverseRels = reverseRelationships(spec, incoming);
  const objectRels = [...objectRelationships(spec, outgoing), ...reverseRels.filter((r) => r.oneToOne)];
  const arrayRels = reverseRels.filter((r) => !r.oneToOne);
  assertUniqueNames(spec, sortedColumns, [...objectRels, ...arrayRels]);
  const sorted = (rels: NamedRel[]): ManualRelationship[] => rels.map((r) => r.rel).sort(byName);

  const generated = tenantPermissions(spec, sortedColumns, new Set(generatedColumns));
  const extra = spec.extraPermissions ?? {};

  const metadata: TableMetadata = {
    table: { schema: spec.schema ?? 'itap', name: spec.name },
    ...(spec.isEnum ? { is_enum: true as const } : {}),
    configuration: { custom_name: spec.name },
  };
  const optional: Partial<TableMetadata> = {
    object_relationships: nonEmpty(sorted(objectRels)),
    array_relationships: nonEmpty(sorted(arrayRels)),
    computed_fields: nonEmpty(
      [...(spec.computedFields ?? [])]
        .sort(byName)
        .map((f) => ({ name: f.name, definition: { function: { schema: f.schema ?? 'itap', name: f.function } } })),
    ),
    insert_permissions: nonEmpty(mergeRoles(generated.insert_permissions, extra.insert_permissions)),
    select_permissions: nonEmpty(
      mergeRoles(
        generated.select_permissions,
        withComputedFields(generated.select_permissions, withAggregations(extra.select_permissions)),
      ),
    ),
    update_permissions: nonEmpty(mergeRoles(generated.update_permissions, extra.update_permissions)),
    delete_permissions: nonEmpty(mergeRoles(generated.delete_permissions, extra.delete_permissions)),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) Object.assign(metadata, { [key]: value });
  }
  return metadata;
}
