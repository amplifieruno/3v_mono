/**
 * The JSON paths of the database's refusal `segment_condition_invalid:<path>`
 * (`itap.validate_segment_node`: `$`, `$.children[1].value[0]`, `$.children[0].op`) and the node of
 * the editor each one belongs to. The client validator answers with the same paths, so a problem
 * found here and one the server reports land on the same node.
 */
import { type NodePath, isGroup, isLeaf, nodeAt } from './segment-conditions-tree';

/** The refusal code of the conditions validator. */
export const CONDITION_INVALID = 'segment_condition_invalid';

/** The JSON path of the node at `path`. */
export function jsonPathOf(path: NodePath): string {
  return `$${path.map((index) => `.children[${index}]`).join('')}`;
}

/** What part of its node a JSON path names: the node itself, or one of its keys. */
export type PathPart = 'node' | 'op' | 'children' | 'field' | 'operator' | 'value';

export interface PathTarget {
  /** The node the path belongs to. */
  readonly node: NodePath;
  readonly part: PathPart;
  /** The value's index in an `in` / `nin` list (`.value[3]`). */
  readonly valueIndex?: number;
}

const STEP = /^\.children\[(\d+)\]/u;
const TAIL = /^(?:\.(op|children|field|operator)|\.value(?:\[(\d+)\])?)?$/u;

/** The node and part a JSON path names, or `null` when it is not a path of the grammar. */
export function targetOfPath(jsonPath: string): PathTarget | null {
  if (!jsonPath.startsWith('$')) return null;
  let rest = jsonPath.slice(1);
  const node: number[] = [];
  for (let step = STEP.exec(rest); step !== null; step = STEP.exec(rest)) {
    node.push(Number(step[1]));
    rest = rest.slice(step[0].length);
  }
  const tail = TAIL.exec(rest);
  if (tail === null) return null;
  const [, key, index] = tail;
  if (key !== undefined) return { node, part: key as PathPart };
  if (rest.startsWith('.value')) return { node, part: 'value', ...(index === undefined ? {} : { valueIndex: Number(index) }) };
  return { node, part: 'node' };
}

/** The JSON path of the node a path belongs to (`$.children[2].value` → `$.children[2]`). */
export function ownerOf(jsonPath: string): string | null {
  const target = targetOfPath(jsonPath);
  return target === null ? null : jsonPathOf(target.node);
}

/** The path a database refusal names (`… segment_condition_invalid:$.children[2].value …`), or `null`. */
export function conditionPathIn(message: string): string | null {
  const match = /segment_condition_invalid:(\$[\w.[\]]*)/u.exec(message);
  return match?.[1] ?? null;
}

/** The JSON path a validation issue names: its last path segment when that is one. */
export function issueJsonPath(issue: { readonly path: readonly unknown[] }): string | null {
  const last = issue.path[issue.path.length - 1];
  return typeof last === 'string' && last.startsWith('$') ? last : null;
}

/** The position of a node for people: "condition 3 of group 1" style, 1-based from the root. */
export function positionOf(path: NodePath): string {
  return path.length === 0 ? 'the top' : path.map((index) => index + 1).join(' › ');
}

/**
 * Where in `conditions` a refusal path points, for a refusal text: the part and the condition's
 * field (`the value of the condition on “end_date” (2 › 3)`), or the path as is when it names no
 * node of these conditions.
 */
export function describeConditionPath(conditions: unknown, jsonPath: string): string {
  const target = targetOfPath(jsonPath);
  const node = target === null ? undefined : nodeAt(conditions, target.node);
  if (target === null || node === undefined) return jsonPath;
  const where = positionOf(target.node);
  if (isLeaf(node)) {
    const part = target.part === 'node' || target.part === 'op' || target.part === 'children' ? 'condition' : target.part;
    const subject = part === 'condition' ? 'the condition' : `the ${part} of the condition`;
    return `${subject} on “${node.field}” (${where})`;
  }
  if (isGroup(node)) return `the group at ${where}`;
  return `the condition at ${where}`;
}
