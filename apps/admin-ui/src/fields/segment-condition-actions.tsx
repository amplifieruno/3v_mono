import { useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type * as React from 'react';
import { useConditionsEditor } from './segment-conditions-context';
import type { NodePath } from './segment-conditions-tree';

export interface NodeActionsProps {
  readonly path: NodePath;
  /** How many nodes share the parent (moving stays inside it). */
  readonly siblings: number;
  /** What the buttons name (`condition 2`, `group 1 › 3`). */
  readonly name: string;
}

/** Move up, move down and remove for one node of the tree (none while the editor is read only). */
export function NodeActions({ path, siblings, name }: NodeActionsProps): React.ReactElement | null {
  const editor = useConditionsEditor();
  const t = useT();
  if (editor.locked) return null;
  const index = path[path.length - 1] ?? 0;
  const inGroup = path.length > 0;
  return (
    <span className="ml-auto inline-flex items-center">
      {inGroup ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            aria-label={t('console.segmentConditions.moveUp', { params: { name } })}
            onClick={() => editor.move(path, -1)}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index >= siblings - 1}
            aria-label={t('console.segmentConditions.moveDown', { params: { name } })}
            onClick={() => editor.move(path, 1)}
          >
            <ArrowDown className="size-4" aria-hidden />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('console.segmentConditions.remove', { params: { name } })}
        onClick={() => editor.remove(path)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </span>
  );
}
