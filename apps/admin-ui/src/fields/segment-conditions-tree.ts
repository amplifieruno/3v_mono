/**
 * A segment's conditions as a tree (`tasks/data-layer/design.md` §6.5, `itap.validate_segment_node`):
 * a group `{"op": "and" | "or" | "not", "children": [...]}` (a node with an `op` key is read as a
 * group, as the database reads it) or a leaf `{"field", "operator", "value"}`. A node is addressed
 * by its child indices from the root (`[]` = the root, `[2, 0]` = the first child of the third).
 * Every edit returns a new tree; nodes the editor does not understand are kept as they are.
 */

export type GroupOp = 'and' | 'or' | 'not';

export const GROUP_OPS: readonly GroupOp[] = ['and', 'or', 'not'];

/** The child indices of a node from the root. */
export type NodePath = readonly number[];

/** The deepest level a node may sit at (the root is level 1). */
export const MAX_DEPTH = 7;

/** The most children a group holds. */
export const MAX_CHILDREN = 100;

export interface ConditionGroup {
  readonly op: unknown;
  readonly children: unknown;
}

export interface ConditionLeaf {
  readonly field: unknown;
  readonly operator: unknown;
  readonly value: unknown;
}

export const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `true` for no conditions: nothing stored, or `{}` (what a manual segment holds). */
export function isEmptyConditions(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  return isPlainObject(value) && Object.keys(value).length === 0;
}

/** A group as the database tells one: an object with an `op` key. */
export const isGroup = (node: unknown): node is ConditionGroup & Readonly<Record<string, unknown>> =>
  isPlainObject(node) && 'op' in node;

/** A leaf whose field and operator are texts (what the editor can edit). */
export interface EditableLeaf extends ConditionLeaf {
  readonly field: string;
  readonly operator: string;
}

/** A leaf the editor can edit: an object with a string field and operator (the value may be anything). */
export const isLeaf = (node: unknown): node is EditableLeaf & Readonly<Record<string, unknown>> =>
  isPlainObject(node) && !('op' in node) && typeof node.field === 'string' && typeof node.operator === 'string';

/** A group's children, or none when they are not a list. */
export function childrenOf(node: unknown): readonly unknown[] {
  return isGroup(node) && Array.isArray(node.children) ? node.children : [];
}

/** The node at `path`, or `undefined` when the path leaves the tree. */
export function nodeAt(root: unknown, path: NodePath): unknown {
  let node = root;
  for (const index of path) {
    const children = childrenOf(node);
    if (index < 0 || index >= children.length) return undefined;
    node = children[index];
  }
  return node;
}

/** The tree with the node at `path` replaced by `next`. */
export function replaceAt(root: unknown, path: NodePath, next: unknown): unknown {
  if (path.length === 0) return next;
  const [index = 0, ...rest] = path;
  if (!isGroup(root)) return root;
  const children = [...childrenOf(root)];
  children[index] = replaceAt(children[index], rest, next);
  return { ...root, children };
}

/** The group at `path` with its children rewritten by `edit`. */
function editChildren(root: unknown, path: NodePath, edit: (children: unknown[]) => unknown[]): unknown {
  const group = nodeAt(root, path);
  if (!isGroup(group)) return root;
  return replaceAt(root, path, { ...group, children: edit([...childrenOf(group)]) });
}

/**
 * The tree without the node at `path`; removing the root, or the last condition of the top group,
 * leaves no conditions (`{}`), not an empty "all of" group.
 */
export function removeAt(root: unknown, path: NodePath): unknown {
  if (path.length === 0) return {};
  const index = path[path.length - 1] ?? 0;
  if (path.length === 1 && childrenOf(root).length === 1 && index === 0) return {};
  return editChildren(root, path.slice(0, -1), (children) => children.filter((_, i) => i !== index));
}

/** The tree with the node at `path` moved `delta` places among its siblings (kept inside the group). */
export function moveAt(root: unknown, path: NodePath, delta: number): unknown {
  if (path.length === 0) return root;
  const index = path[path.length - 1] ?? 0;
  return editChildren(root, path.slice(0, -1), (children) => {
    const to = index + delta;
    if (to < 0 || to >= children.length) return children;
    const [moved] = children.splice(index, 1);
    children.splice(to, 0, moved);
    return children;
  });
}

/**
 * The tree with `child` added under the node at `path`: appended to a group; a root leaf (or an
 * unreadable root) becomes the first condition of a new "all of" group; no conditions yet = the
 * child is the root.
 */
export function addChild(root: unknown, path: NodePath, child: unknown): unknown {
  if (path.length === 0 && isEmptyConditions(root)) return child;
  const node = nodeAt(root, path);
  if (isGroup(node)) return editChildren(root, path, (children) => [...children, child]);
  return replaceAt(root, path, { op: 'and', children: [node, child] });
}

/**
 * The tree with the group at `path` switched to `op`. "Not" takes one condition: a group of
 * several switched to "not" keeps them, grouped under the old "all of" / "any of".
 */
export function setGroupOp(root: unknown, path: NodePath, op: GroupOp): unknown {
  const group = nodeAt(root, path);
  if (!isGroup(group)) return root;
  const children = childrenOf(group);
  if (op === 'not' && children.length > 1) {
    const inner = group.op === 'or' ? 'or' : 'and';
    return replaceAt(root, path, { op, children: [{ op: inner, children }] });
  }
  return replaceAt(root, path, { ...group, op });
}

/** The level of the node at `path` (the root is 1). */
export const depthOf = (path: NodePath): number => path.length + 1;

/** What may be added under the group at `path`: a condition, a nested group. */
export function canAdd(group: unknown, path: NodePath): { readonly leaf: boolean; readonly group: boolean } {
  const children = childrenOf(group);
  const room = children.length < MAX_CHILDREN && !(isGroup(group) && group.op === 'not' && children.length >= 1);
  const depth = depthOf(path);
  // A child sits one level down; a nested group needs one more level for its own condition.
  return { leaf: room && depth + 1 <= MAX_DEPTH, group: room && depth + 2 <= MAX_DEPTH };
}
