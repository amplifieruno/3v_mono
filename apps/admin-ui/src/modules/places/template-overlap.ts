import type { TemplateNode } from '../../fields/template-structure-format';

/** An existing area as the overlap check reads it. */
export interface SiblingArea {
  readonly name: string;
  readonly parent_id: string | null;
}

/**
 * The template's top-level names that an area under the same parent (`parentId`, `null` for
 * the facility's top level) already carries. `apply_facility_template` creates every node
 * regardless, so each of these ends up twice. Compared trimmed and case-insensitively, as a
 * person reads names; each name is listed once, in template order.
 */
export function overlappingNames(
  roots: readonly TemplateNode[],
  areas: readonly SiblingArea[],
  parentId: string | null,
): string[] {
  const norm = (name: string): string => name.trim().toLocaleLowerCase();
  const existing = new Set(
    areas.filter((area) => area.parent_id === parentId).map((area) => norm(area.name)),
  );
  const out: string[] = [];
  for (const root of roots) {
    if (existing.has(norm(root.name)) && !out.includes(root.name)) out.push(root.name);
  }
  return out;
}
