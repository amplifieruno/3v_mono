import { isDateType } from './segment-conditions-operators';
import type { Translate } from './segment-conditions-format';
import { positionOf } from './segment-conditions-path';
import type { NodePath } from './segment-conditions-tree';

/** How buttons and screen readers name a node: `Condition 2 › 1`, `Group 3`, the top group. */
export function nodeName(path: NodePath, kind: 'condition' | 'group', t: Translate): string {
  if (path.length === 0) return t(`console.segmentConditions.${kind === 'group' ? 'rootGroup' : 'rootCondition'}`);
  return t(`console.segmentConditions.${kind}Name`, { params: { position: positionOf(path) } });
}

/** The bundle key of an operator's label; dates read after / before instead of more / less. */
export function operatorKey(operator: string, type: string | undefined): string {
  const dated: Readonly<Record<string, string>> = { gt: 'after', gte: 'onOrAfter', lt: 'before', lte: 'onOrBefore' };
  const name = type !== undefined && isDateType(type) ? (dated[operator] ?? operator) : operator;
  return `console.segmentConditions.op.${name === 'is_null' ? 'isNull' : name}`;
}
