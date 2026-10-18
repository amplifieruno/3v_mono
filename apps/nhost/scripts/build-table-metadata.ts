import type {
  BoolExp,
  ForeignKey,
  HasuraPermissions,
  ManualRelationship,
  RolePermission,
  TableMetadata,
  TableSpec,
} from '../metadata-src/types.js';

const ORG_COLUMN = 'organization_id';
const TENANT_ROLE = 'org_admin';
const NEVER_WRITABLE = new Set(['id', ORG_COLUMN, 'created_at', 'updated_at', 'created_by']);
const ARRAY_OVERRIDE_SUFFIX = '#array';

/** Relationship stem: FK columns without `organization_id`, each minus `_id`; `organization` for the org FK. */
function fkStem(columns: string[]): string {
  const own = columns.filter((c) => c !== ORG_COLUMN);
  if (own.length === 0) return 'organization';
  return own.map((c) => c.replace(/_id$/, '')).join('_');
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
      name: spec.relationshipNames?.[fk.constraint] ?? fkStem(fk.columns),
      using: {
        manual_configuration: {
          remote_table: { schema: fk.refSchema ?? 'itap', name: fk.refTable },
          column_mapping: mapping(fk.columns, fk.refColumns),
        },
      },
    },
  }));
}

function arrayRelationships(spec: TableSpec, incoming: ForeignKey[]): NamedRel[] {
  const childKey = (fk: ForeignKey): string => `${fk.schema ?? 'itap'}.${fk.table}`;
  const perChild = new Map<string, number>();
  for (const fk of incoming) perChild.set(childKey(fk), (perChild.get(childKey(fk)) ?? 0) + 1);

  const names = spec.relationshipNames ?? {};
  return incoming.map((fk) => {
    const derived = (perChild.get(childKey(fk)) ?? 0) > 1 ? `${fk.table}_by_${fkStem(fk.columns)}` : fk.table;
    return {
      constraint: fk.constraint,
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

function assertKnownColumns(spec: TableSpec, columns: string[]): void {
  for (const col of [...(spec.readOnlyColumns ?? []), ...(spec.secretColumns ?? [])]) {
    if (!columns.includes(col)) throw new Error(`Table ${spec.name}: unknown column "${col}" in spec`);
  }
}

function tenantPermissions(spec: TableSpec, columns: string[]): HasuraPermissions {
  if (spec.profile === 'none') return {};
  if (!columns.includes(ORG_COLUMN)) {
    throw new Error(`Table ${spec.name}: profile ${spec.profile} requires an ${ORG_COLUMN} column`);
  }
  const filter: BoolExp = { [ORG_COLUMN]: { _eq: 'X-Hasura-Organization-Id' } };
  const secret = new Set(spec.secretColumns ?? []);
  const readOnly = new Set(spec.readOnlyColumns ?? []);
  const selectable = columns.filter((c) => !secret.has(c));
  const select: HasuraPermissions = {
    select_permissions: [{ role: TENANT_ROLE, permission: { columns: selectable, filter, allow_aggregations: true } }],
  };
  if (spec.profile === 'tenant_read') return select;

  const writable = columns.filter((c) => !readOnly.has(c) && !NEVER_WRITABLE.has(c));
  const set: Record<string, string> = { [ORG_COLUMN]: 'x-hasura-organization-id' };
  if (columns.includes('created_by')) set.created_by = 'x-hasura-user-id';

  return {
    insert_permissions: [{ role: TENANT_ROLE, permission: { columns: writable, check: filter, set } }],
    ...select,
    update_permissions: [{ role: TENANT_ROLE, permission: { columns: writable, filter } }],
    ...(spec.noDelete ? {} : { delete_permissions: [{ role: TENANT_ROLE, permission: { filter } }] }),
  };
}

function mergeRoles<P>(base: RolePermission<P>[] = [], extra: RolePermission<P>[] = []): RolePermission<P>[] {
  const byRole = new Map<string, RolePermission<P>>();
  for (const entry of [...base, ...extra]) byRole.set(entry.role, entry);
  return [...byRole.values()].sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}

function nonEmpty<T>(list: T[]): T[] | undefined {
  return list.length > 0 ? list : undefined;
}

export function buildTableMetadata(
  spec: TableSpec,
  columns: string[],
  outgoing: ForeignKey[],
  incoming: ForeignKey[],
): TableMetadata {
  const sortedColumns = [...columns].sort();
  assertKnownColumns(spec, sortedColumns);

  const objectRels = objectRelationships(spec, outgoing);
  const arrayRels = arrayRelationships(spec, incoming);
  assertUniqueNames(spec, sortedColumns, [...objectRels, ...arrayRels]);
  const sorted = (rels: NamedRel[]): ManualRelationship[] => rels.map((r) => r.rel).sort(byName);

  const generated = spec.isEnum ? {} : tenantPermissions(spec, sortedColumns);
  const extra = spec.extraPermissions ?? {};

  const metadata: TableMetadata = {
    table: { schema: spec.schema ?? 'itap', name: spec.name },
    ...(spec.isEnum ? { is_enum: true as const } : {}),
    configuration: { custom_name: spec.name },
  };
  const optional: Partial<TableMetadata> = {
    object_relationships: nonEmpty(sorted(objectRels)),
    array_relationships: nonEmpty(sorted(arrayRels)),
    insert_permissions: nonEmpty(mergeRoles(generated.insert_permissions, extra.insert_permissions)),
    select_permissions: nonEmpty(mergeRoles(generated.select_permissions, extra.select_permissions)),
    update_permissions: nonEmpty(mergeRoles(generated.update_permissions, extra.update_permissions)),
    delete_permissions: nonEmpty(mergeRoles(generated.delete_permissions, extra.delete_permissions)),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) Object.assign(metadata, { [key]: value });
  }
  return metadata;
}
