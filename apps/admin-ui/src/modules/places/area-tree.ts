/** One area as the facility tree reads it (a row of the `area` list). */
export interface AreaTreeRow {
  readonly id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly area_type: string;
  readonly access_level?: string | null;
  readonly status?: string | null;
  readonly capacity: number | null;
  readonly current_occupancy: number | null;
}

/** An area with its sub-areas, siblings in name order. */
export interface AreaTreeNode {
  readonly area: AreaTreeRow;
  /** 0 for a root of the tree (no parent, or a parent not among the rows read). */
  readonly level: number;
  readonly children: readonly AreaTreeNode[];
}

const byName = (a: AreaTreeNode, b: AreaTreeNode): number =>
  a.area.name.localeCompare(b.area.name, undefined, { sensitivity: 'base', numeric: true }) ||
  a.area.id.localeCompare(b.area.id);

/**
 * The forest of a facility's areas from flat rows in any order: each row under its
 * parent, siblings sorted by name. A row whose parent is not among the rows (a list
 * cut at its page size) becomes a root instead of being lost. A parent loop, which the
 * database refuses (`area_cycle`), would leave its rows out rather than recurse forever.
 */
export function buildAreaTree(rows: readonly AreaTreeRow[]): AreaTreeNode[] {
  const ids = new Set(rows.map((row) => row.id));
  const childrenOf = new Map<string | null, AreaTreeRow[]>();
  for (const row of rows) {
    const parent = row.parent_id !== null && ids.has(row.parent_id) ? row.parent_id : null;
    const siblings = childrenOf.get(parent);
    if (siblings === undefined) childrenOf.set(parent, [row]);
    else siblings.push(row);
  }
  const seen = new Set<string>();
  const build = (parent: string | null, level: number): AreaTreeNode[] => {
    const nodes: AreaTreeNode[] = [];
    for (const area of childrenOf.get(parent) ?? []) {
      if (seen.has(area.id)) continue;
      seen.add(area.id);
      nodes.push({ area, level, children: build(area.id, level + 1) });
    }
    return nodes.sort(byName);
  };
  return build(null, 0);
}

/** The ids of every node that has children: the tree opens fully by default. */
export function branchIds(nodes: readonly AreaTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children.length === 0 ? [] : [node.area.id, ...branchIds(node.children)],
  );
}

/**
 * The nodes to draw, depth first, skipping the sub-areas of every collapsed node.
 */
export function visibleNodes(
  nodes: readonly AreaTreeNode[],
  collapsed: ReadonlySet<string>,
): AreaTreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(collapsed.has(node.area.id) ? [] : visibleNodes(node.children, collapsed)),
  ]);
}

/**
 * Whether a row whose `path` (ids from the top-level area down to the row itself) is `path`
 * lies inside `areaId`'s subtree, the area itself included: such a row cannot be its parent.
 */
export function isInsideArea(path: unknown, areaId: string): boolean {
  return Array.isArray(path) && path.includes(areaId);
}
