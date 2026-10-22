import { useT } from '@burojs/react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@burojs/ui-shadcn';
import { ListPlus, Plus } from 'lucide-react';
import type * as React from 'react';
import { NodeActions } from './segment-condition-actions';
import { NodeProblems } from './segment-condition-problems';
import { nodeName } from './segment-conditions-labels';
import { ConditionLeafEditor } from './segment-condition-leaf';
import { useConditionsEditor } from './segment-conditions-context';
import { jsonPathOf } from './segment-conditions-path';
import { GROUP_OPS, type GroupOp, type NodePath, canAdd, childrenOf, isGroup, isLeaf } from './segment-conditions-tree';

export interface ConditionNodeProps {
  readonly node: unknown;
  readonly path: NodePath;
  readonly siblings: number;
}

/**
 * One node of the tree: a group (its operator, its children, add buttons), a condition, or —
 * for anything the editor cannot read — the node as stored with its problem and a remove button.
 */
export function ConditionNode({ node, path, siblings }: ConditionNodeProps): React.ReactElement {
  if (isGroup(node)) return <ConditionGroupEditor node={node} path={path} siblings={siblings} />;
  if (isLeaf(node)) return <ConditionLeafEditor leaf={node} path={path} siblings={siblings} />;
  return <UnreadableNode node={node} path={path} siblings={siblings} />;
}

function UnreadableNode({ node, path, siblings }: ConditionNodeProps): React.ReactElement {
  const editor = useConditionsEditor();
  const t = useT();
  const jsonPath = jsonPathOf(path);
  const name = nodeName(path, 'condition', t);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed p-2" data-testid={`segment-node-${jsonPath}`} data-invalid role="group" aria-label={name}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{t('console.segmentConditions.unreadable')}</span>
        <code className="truncate text-xs text-muted-foreground">{JSON.stringify(node)}</code>
        <NodeActions path={path} siblings={siblings} name={name} />
      </div>
      <NodeProblems id={`${editor.prefix}-${path.join('-') || 'root'}-problem`} problems={editor.problemsAt(jsonPath)} />
    </div>
  );
}

const OP_KEYS: Readonly<Record<GroupOp, string>> = { and: 'all', or: 'any', not: 'none' };

function ConditionGroupEditor({ node, path, siblings }: ConditionNodeProps): React.ReactElement {
  const editor = useConditionsEditor();
  const t = useT();
  const jsonPath = jsonPathOf(path);
  const children = childrenOf(node);
  const op = isGroup(node) && typeof node.op === 'string' && (GROUP_OPS as readonly string[]).includes(node.op) ? (node.op as GroupOp) : undefined;
  const problems = editor.problemsAt(jsonPath);
  const room = canAdd(node, path);
  const name = nodeName(path, 'group', t);
  const id = `${editor.prefix}-${path.join('-') || 'root'}`;
  return (
    <div
      className={cn('flex flex-col gap-2 rounded-md border p-3', path.length > 0 && 'bg-muted/30')}
      data-testid={`segment-node-${jsonPath}`}
      data-invalid={problems.length > 0 || undefined}
      role="group"
      aria-label={name}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={op ?? ''} disabled={editor.locked} onValueChange={(next) => editor.setOp(path, next as GroupOp)}>
          <SelectTrigger id={`${id}-op`} className="w-56" aria-label={t('console.segmentConditions.groupOp')} aria-invalid={op === undefined || undefined}>
            <SelectValue placeholder={t('console.segmentConditions.choose')} />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`console.segmentConditions.group.${OP_KEYS[value]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <NodeActions path={path} siblings={siblings} name={name} />
      </div>
      <div className="flex flex-col gap-2 pl-4">
        {children.map((child, index) => (
          // Children have no identity of their own; the position is the key.
          <ConditionNode key={index} node={child} path={[...path, index]} siblings={children.length} />
        ))}
      </div>
      {editor.locked ? null : (
        <div className="flex flex-wrap gap-2 pl-4">
          <Button type="button" variant="outline" size="sm" disabled={!room.leaf} onClick={() => editor.add(path, 'leaf')}>
            <Plus className="size-4" aria-hidden />
            {t('console.segmentConditions.addCondition')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!room.group} onClick={() => editor.add(path, 'group')}>
            <ListPlus className="size-4" aria-hidden />
            {t('console.segmentConditions.addGroup')}
          </Button>
        </div>
      )}
      <NodeProblems id={`${id}-problem`} problems={problems} />
    </div>
  );
}
