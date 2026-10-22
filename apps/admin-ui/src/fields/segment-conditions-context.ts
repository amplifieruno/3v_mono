import * as React from 'react';
import type { Catalog } from './segment-conditions-operators';
import type { ConditionRefs } from './segment-conditions-refs';
import type { NodePath } from './segment-conditions-tree';

/** What every node of the conditions editor reads and how it writes the tree. */
export interface ConditionsEditor {
  readonly catalog: Catalog;
  readonly refs: ConditionRefs;
  readonly target: string;
  readonly self: string | undefined;
  readonly locked: boolean;
  /** The id prefix of the editor's controls. */
  readonly prefix: string;
  /** The problem texts of the node with this JSON path (client and server), first first. */
  readonly problemsAt: (jsonPath: string) => readonly string[];
  /** Replaces the node at `path`. */
  readonly replace: (path: NodePath, next: unknown) => void;
  readonly remove: (path: NodePath) => void;
  readonly move: (path: NodePath, delta: number) => void;
  readonly add: (path: NodePath, kind: 'leaf' | 'group') => void;
  readonly setOp: (path: NodePath, op: 'and' | 'or' | 'not') => void;
  readonly onBlur?: () => void;
}

export const ConditionsEditorContext = React.createContext<ConditionsEditor | null>(null);

export function useConditionsEditor(): ConditionsEditor {
  const editor = React.useContext(ConditionsEditorContext);
  if (editor === null) throw new Error('A condition node is rendered outside the conditions editor.');
  return editor;
}
