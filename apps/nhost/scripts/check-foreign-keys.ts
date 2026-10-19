import type { ForeignKey } from '../metadata-src/types.js';
import type { Introspection } from './plan-metadata.js';

const ORG_COLUMN = 'organization_id';

const qualified = (schema: string | undefined, table: string): string => `${schema ?? 'itap'}.${table}`;

const sameSet = (a: string[], b: Set<string>): boolean => a.length === b.size && a.every((c) => b.has(c));

function tablesWithOrgColumn(intro: Introspection): Set<string> {
  return new Set(intro.columns.filter((c) => c.column === ORG_COLUMN).map((c) => qualified(c.schema, c.table)));
}

/**
 * Tenant integrity rules from design §4.1, checked on the live schema:
 * 1. an FK between two tables that both have `organization_id` must include `organization_id` (composite FK), so a
 *    row can never reference a row of another organization;
 * 2. every FK column set is covered by an index whose leading columns are the FK columns, plus `organization_id`
 *    on tenant tables (a primary key or unique constraint counts; partial and expression indexes do not).
 * Throws one error listing every violation.
 */
export function assertTenantForeignKeys(intro: Introspection): void {
  const tenant = tablesWithOrgColumn(intro);
  const errors: string[] = [];
  for (const fk of intro.foreignKeys) {
    const table = qualified(fk.schema, fk.table);
    const ref = qualified(fk.refSchema, fk.refTable);
    if (tenant.has(table) && tenant.has(ref)) {
      const orgIndex = fk.columns.indexOf(ORG_COLUMN);
      if (orgIndex < 0 || fk.refColumns[orgIndex] !== ORG_COLUMN) {
        errors.push(
          `${fk.constraint} (${table} -> ${ref}): both tables have ${ORG_COLUMN}, so the FK must be composite ` +
            `(${ORG_COLUMN}, ...) -> (${ORG_COLUMN}, ...)`,
        );
      }
    }
    const required = new Set(tenant.has(table) ? [ORG_COLUMN, ...fk.columns] : fk.columns);
    const covered = intro.indexes.some(
      (ix) => qualified(ix.schema, ix.table) === table && sameSet(ix.columns.slice(0, required.size), required),
    );
    if (!covered) {
      errors.push(`${fk.constraint} (${table}): no index leading with (${[...required].join(', ')})`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Foreign key rules (design §4.1) violated:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * Marks FKs whose child columns contain the child's primary key or a unique key (one-to-one): the parent then gets
 * an object relationship instead of an array relationship for the reverse side.
 */
export function markOneToOne(intro: Introspection): ForeignKey[] {
  return intro.foreignKeys.map((fk) => {
    const table = qualified(fk.schema, fk.table);
    const oneToOne = intro.indexes.some(
      (ix) => ix.unique && qualified(ix.schema, ix.table) === table && ix.columns.every((c) => fk.columns.includes(c)),
    );
    return oneToOne ? { ...fk, oneToOne: true } : fk;
  });
}
