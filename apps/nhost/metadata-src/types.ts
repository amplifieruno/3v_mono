export type PermissionProfile = 'tenant_crud' | 'tenant_read' | 'none';

export type ManagedSchema = 'itap' | 'itap_results';

/** Nhost-owned schemas an itap table may reference (object end only; their metadata files are never touched). */
export type ExternalSchema = 'auth' | 'storage';

/** Hasura boolean expression (filter / check). */
export type BoolExp = { [key: string]: unknown };

export interface SelectPermission {
  columns: string[];
  filter: BoolExp;
  allow_aggregations?: boolean;
  limit?: number;
}

export interface InsertPermission {
  columns: string[];
  check: BoolExp;
  set?: Record<string, string>;
}

export interface UpdatePermission {
  columns: string[];
  filter: BoolExp;
  check?: BoolExp;
  set?: Record<string, string>;
}

export interface DeletePermission {
  filter: BoolExp;
}

export interface RolePermission<P> {
  role: string;
  permission: P;
}

export interface HasuraPermissions {
  insert_permissions?: RolePermission<InsertPermission>[];
  select_permissions?: RolePermission<SelectPermission>[];
  update_permissions?: RolePermission<UpdatePermission>[];
  delete_permissions?: RolePermission<DeletePermission>[];
}

export interface TableSpec {
  name: string;
  schema?: ManagedSchema;
  /** Enum tables must use profile 'none'. */
  isEnum?: boolean;
  profile: PermissionProfile;
  /** Visible on select, never writable (trigger/backend maintained). */
  readOnlyColumns?: string[];
  /** Writable, never selectable (e.g. hashes). */
  secretColumns?: string[];
  noDelete?: boolean;
  /**
   * Relationship name overrides keyed by FK constraint name. An override applies to the relationship end
   * that lives in the table owning this spec: the object end in the child's spec, the array end in the
   * parent's spec. Only for a self-reference are both ends in one spec; then a plain key renames both and
   * `"<constraint>#array"` renames only the array end. Keys matching no constraint are an error.
   */
  relationshipNames?: Record<string, string>;
  /** Merged last; an entry replaces the generated entry for the same role. */
  extraPermissions?: HasuraPermissions;
}

export interface ForeignKey {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  constraint: string;
  /** Schema of `table`; defaults to `itap`. */
  schema?: ManagedSchema;
  /** Schema of `refTable`; defaults to `itap`. External targets (auth.users, storage.files) get only the object end. */
  refSchema?: ManagedSchema | ExternalSchema;
}

export interface QualifiedTable {
  schema: string;
  name: string;
}

export interface ManualRelationship {
  name: string;
  using: {
    manual_configuration: {
      remote_table: QualifiedTable;
      column_mapping: Record<string, string>;
    };
  };
}

export interface TableMetadata extends HasuraPermissions {
  table: QualifiedTable;
  is_enum?: true;
  configuration: { custom_name: string };
  object_relationships?: ManualRelationship[];
  array_relationships?: ManualRelationship[];
}
