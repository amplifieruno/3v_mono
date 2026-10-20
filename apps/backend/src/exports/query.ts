import { HasuraError, type HasuraClient } from '../hasura/client.js';

/**
 * Export queries (slice 10 task 4), always sent with the requesting member's client: the columns are the fields the
 * member's role can read (GraphQL introspection under that role), rows are filtered by its permissions, so a file
 * never holds what the member could not query themselves (Review Focus 4).
 */

export class ExportFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFailure';
  }
}

type EntityConfig = { watermark: string; window?: { column: string; days: number } };

/** Exportable root fields (= itap.export_entities) with their watermark column (rows are paged in its order). */
export const EXPORT_ENTITIES: Record<string, EntityConfig> = {
  profiles: { watermark: 'created_at' },
  identities: { watermark: 'created_at' },
  events: { watermark: 'created_at' },
  incidents: { watermark: 'created_at' },
  visits: { watermark: 'created_at' },
  access_decisions: { watermark: 'created_at' },
  detections: { watermark: 'created_at', window: { column: 'detected_at', days: 31 } },
  authentication_attempts: { watermark: 'created_at' },
  audit_log: { watermark: 'occurred_at' },
};

export const PAGE_SIZE = 1000;
export const MAX_ROWS = 50_000;
const NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

type TypeRef = { kind: string; name: string | null; ofType: TypeRef | null };
type Field = { name: string; args: { name: string; type: { kind: string } }[]; type: TypeRef };

const COLUMNS = `
  query ExportColumns($name: String!) {
    __type(name: $name) { fields { name args { name type { kind } } type { kind name ofType { kind name ofType { kind name } } } } }
  }
`;

function leafKind(t: TypeRef): string {
  return t.kind === 'NON_NULL' && t.ofType ? leafKind(t.ofType) : t.kind;
}

export function entityConfig(entity: string): EntityConfig {
  const config = Object.hasOwn(EXPORT_ENTITIES, entity) ? EXPORT_ENTITIES[entity] : undefined;
  if (!config || !NAME.test(entity)) throw new ExportFailure(`entity_not_exportable:${entity}`);
  return config;
}

/** Scalar / enum fields (without required arguments) of the entity's type, as the member's role sees it. */
export async function readableColumns(member: HasuraClient, entity: string): Promise<string[]> {
  const { watermark } = entityConfig(entity);
  const { __type: type } = await member.request<{ __type: { fields: Field[] } | null }>(COLUMNS, { name: entity });
  const columns = (type?.fields ?? [])
    // Optional arguments only (jsonb columns take an optional `path`).
    .filter((f) => f.args.every((a) => a.type.kind !== 'NON_NULL') && ['SCALAR', 'ENUM'].includes(leafKind(f.type)) && NAME.test(f.name))
    .map((f) => f.name)
    .sort();
  if (!columns.includes('id') || !columns.includes(watermark)) throw new ExportFailure('entity_not_readable');
  return columns;
}

/** The job's where: the definition's filters, the entity window, rows after the watermark, rows up to `until`. */
export function baseWhere(entity: string, filters: Record<string, unknown>, watermarkFrom: string | null, until: Date): Record<string, unknown> {
  const { watermark, window } = entityConfig(entity);
  const parts: Record<string, unknown>[] = [filters, { [watermark]: { _lte: until.toISOString() } }];
  if (window) parts.push({ [window.column]: { _gte: new Date(until.getTime() - window.days * 86_400_000).toISOString() } });
  if (watermarkFrom) parts.push({ [watermark]: { _gt: watermarkFrom } });
  return { _and: parts };
}

/** Dry query of the filters alone: a where Hasura refuses (unknown column, bad operator) fails as invalid_filters. */
export async function validateFilters(member: HasuraClient, entity: string, filters: Record<string, unknown>): Promise<void> {
  entityConfig(entity);
  try {
    await member.request(`query ExportDryRun($where: ${entity}_bool_exp!) { ${entity}(where: $where, limit: 0) { id } }`, { where: filters });
  } catch (error: unknown) {
    if (error instanceof HasuraError) throw new ExportFailure(`invalid_filters: ${error.message}`.slice(0, 500));
    throw error;
  }
}

export type ExportRows = { rows: Record<string, unknown>[]; truncated: boolean; lastWatermark: string | null };

/** Every row (up to MAX_ROWS) in (watermark, id) order, keyset-paged. */
export async function fetchRows(
  member: HasuraClient,
  entity: string,
  columns: string[],
  where: Record<string, unknown>,
  maxRows = MAX_ROWS,
): Promise<ExportRows> {
  const { watermark } = entityConfig(entity);
  const query = `
    query ExportPage($where: ${entity}_bool_exp!, $limit: Int!) {
      rows: ${entity}(where: $where, order_by: [{ ${watermark}: asc }, { id: asc }], limit: $limit) { ${columns.join(' ')} }
    }
  `;
  const rows: Record<string, unknown>[] = [];
  let after: Record<string, unknown> | null = null;
  // One row past the cap tells whether the export is truncated.
  for (;;) {
    const limit = Math.min(PAGE_SIZE, maxRows + 1 - rows.length);
    const pageWhere: Record<string, unknown> = after ? { _and: [where, after] } : where;
    const { rows: page } = await member.request<{ rows: Record<string, unknown>[] }>(query, { where: pageWhere, limit });
    rows.push(...page);
    if (page.length < limit || rows.length > maxRows) break;
    const last = page[page.length - 1];
    after = { _or: [{ [watermark]: { _gt: last[watermark] } }, { [watermark]: { _eq: last[watermark] }, id: { _gt: last.id } }] };
  }
  const truncated = rows.length > maxRows;
  if (truncated) rows.length = maxRows;
  const tail = rows[rows.length - 1];
  return { rows, truncated, lastWatermark: tail ? String(tail[watermark]) : null };
}
