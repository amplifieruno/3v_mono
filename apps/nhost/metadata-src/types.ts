export type PermissionProfile = 'tenant_crud' | 'tenant_read' | 'none';

export type ManagedSchema = 'itap' | 'itap_results';

/** Nhost-owned schemas an itap table may reference (object end only; their metadata files are never touched). */
export type ExternalSchema = 'auth' | 'storage';

/** Hasura boolean expression (filter / check). */
export type BoolExp = { [key: string]: unknown };

export interface SelectPermission {
  columns: string[];
  computed_fields?: string[];
  filter: BoolExp;
  allow_aggregations?: boolean;
  limit?: number;
  /** Root fields exposed for the role; `[]` hides the table's root fields (rows reachable via functions only). */
  query_root_fields?: string[];
  subscription_root_fields?: string[];
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

/** Hasura computed field backed by a STABLE SQL function taking the table's row type as its first argument. */
export interface ComputedFieldSpec {
  name: string;
  function: string;
  /** Schema of the function; defaults to `itap`. */
  schema?: string;
}

export interface TableSpec {
  name: string;
  schema?: ManagedSchema;
  /** Enum tables must use profile 'none'. */
  isEnum?: boolean;
  profile: PermissionProfile;
  /** Visible on select, never writable (trigger/backend maintained). */
  readOnlyColumns?: string[];
  /** Writable on insert, never updatable (e.g. the member's `user_id`). */
  insertOnlyColumns?: string[];
  /** Writable, never selectable (e.g. hashes). */
  secretColumns?: string[];
  /** Exposed to every role that can select the table (listed in its select permissions). */
  computedFields?: ComputedFieldSpec[];
  noDelete?: boolean;
  /** No insert permission for the tenant role (rows are created by a backend action). */
  noInsert?: boolean;
  /**
   * Relationship name overrides keyed by FK constraint name. An override applies to the relationship end
   * that lives in the table owning this spec: the object end in the child's spec, the reverse end (array, or object
   * for a one-to-one FK) in the parent's spec. Only for a self-reference are both ends in one spec; then a plain key
   * renames both and `"<constraint>#array"` renames only the reverse end. Keys matching no constraint are an error.
   */
  relationshipNames?: Record<string, string>;
  /** Merged last; an entry replaces the generated entry for the same role. */
  extraPermissions?: HasuraPermissions;
  /**
   * Hasura event triggers on this table (design §8.4: external side effects only; handlers idempotent). Webhook
   * `{{BACKEND_URL}}/hasura/events/<name>`, header `x-action-secret` from env ACTION_SECRET, retries default to
   * 3 x 10 s with a 60 s timeout.
   */
  eventTriggers?: EventTriggerSpec[];
}

export type TriggerOperation = 'insert' | 'update' | 'delete';

/** Retry overrides (defaults: num_retries 3, retry_interval_seconds 10, timeout_seconds 60). */
export interface RetrySpec {
  num_retries?: number;
  retry_interval_seconds?: number;
  timeout_seconds?: number;
}

export interface EventTriggerSpec {
  /** Unique per source; lowercase snake_case, at most 42 characters (Hasura's limit). */
  name: string;
  operations: TriggerOperation[];
  /** Columns whose change fires an update trigger (default: all); only valid with the update operation. */
  columns?: string[];
  retry?: RetrySpec;
}

/** A Hasura cron trigger (design §8.3), generated into cron_triggers.yaml; handled at /hasura/events/<name>. */
export interface CronSpec {
  name: string;
  /** Standard 5-field cron expression, UTC. */
  schedule: string;
  payload?: Record<string, unknown>;
  comment?: string;
  retry?: RetrySpec;
  /** Always true: the cron lives in exported metadata (git), not only in the database. */
  includeInMetadata: true;
}

export interface WebhookHeader {
  name: string;
  value_from_env: string;
}

export interface EventTriggerMetadata {
  name: string;
  definition: {
    enable_manual: false;
    insert?: { columns: '*' };
    update?: { columns: '*' | string[] };
    delete?: { columns: '*' };
  };
  retry_conf: { num_retries: number; interval_sec: number; timeout_sec: number };
  webhook: string;
  headers: WebhookHeader[];
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
  /** Child columns are unique (PK or unique key): the reverse side is an object relationship, not an array. */
  oneToOne?: boolean;
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
  computed_fields?: { name: string; definition: { function: QualifiedTable } }[];
  event_triggers?: EventTriggerMetadata[];
}

/**
 * A tracked SQL function (design §8.0). Permissions are explicit (INFER_FUNCTION_PERMISSIONS is off); a role needs
 * select permission on the function's return table.
 */
export interface FunctionSpec {
  name: string;
  /** Schema of the function; defaults to `itap`. */
  schema?: 'itap';
  exposedAs: 'query' | 'mutation';
  /** The `json` argument Hasura fills with the session variables (org scoping happens inside the function). */
  sessionArgument?: 'hasura_session';
  /** GraphQL root field name; defaults to the function name. */
  customName?: string;
  /**
   * Roles allowed to call the function; `[]` = admin secret only (e.g. called by an action handler). A function
   * exposed to a role must take the session argument, and each role's select filter on the return table must
   * restrict `organization_id` (double guard, design §8.0) unless `unscopedReturnReason` explains why not.
   */
  roles: string[];
  /** Opt-out of the return-table `organization_id` filter check, with the reason (non-empty). */
  unscopedReturnReason?: string;
}

export interface FunctionMetadata {
  function: QualifiedTable;
  configuration: { custom_name: string; exposed_as: 'query' | 'mutation'; session_argument?: string };
  permissions?: { role: string }[];
}
