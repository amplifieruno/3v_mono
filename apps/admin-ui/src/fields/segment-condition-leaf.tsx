import { useT } from '@burojs/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { NodeActions } from './segment-condition-actions';
import { NodeProblems } from './segment-condition-problems';
import { ConditionValue } from './segment-condition-value';
import { useConditionsEditor } from './segment-conditions-context';
import { nodeName, operatorKey } from './segment-conditions-labels';
import { withField, withOperator } from './segment-conditions-operators';
import { jsonPathOf } from './segment-conditions-path';
import type { EditableLeaf, NodePath } from './segment-conditions-tree';

export interface ConditionLeafEditorProps {
  readonly path: NodePath;
  readonly leaf: EditableLeaf;
  readonly siblings: number;
}

/**
 * One condition: the field (the catalog's fields of the target), the operator (the field's
 * operators) and the value editor of its type. A field the catalog does not offer stays chosen,
 * named "no longer offered" and flagged, until it is changed or the condition removed.
 */
export function ConditionLeafEditor({ path, leaf, siblings }: ConditionLeafEditorProps): React.ReactElement {
  const editor = useConditionsEditor();
  const t = useT();
  const jsonPath = jsonPathOf(path);
  const id = `${editor.prefix}-${path.join('-') || 'root'}`;
  const spec = editor.catalog.get(leaf.field);
  const problems = editor.problemsAt(jsonPath);
  const invalid = problems.length > 0;
  const parts = editor.partsAt(jsonPath);
  const problemId = `${id}-problem`;
  const flagField = parts.has('field') || (invalid && spec === undefined);
  const flagOperator = parts.has('operator');
  const flagValue = parts.has('value') || parts.has('node');
  const name = nodeName(path, 'condition', t);
  const operators = spec?.operators ?? [leaf.operator];
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-dashed p-2"
      data-testid={`segment-node-${jsonPath}`}
      data-invalid={invalid || undefined}
      role="group"
      aria-label={name}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={leaf.field}
          disabled={editor.locked}
          onValueChange={(field) => {
            const next = editor.catalog.get(field);
            if (next !== undefined) editor.replace(path, withField(leaf, spec, next));
          }}
        >
          <SelectTrigger id={`${id}-field`} className="w-60" aria-label={t('console.segmentConditions.field')} aria-invalid={flagField || undefined} aria-describedby={flagField ? problemId : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec === undefined ? (
              <SelectItem value={leaf.field}>{t('console.segmentConditions.unknownFieldName', { params: { field: leaf.field } })}</SelectItem>
            ) : null}
            {[...editor.catalog.values()].map((entry) => (
              <SelectItem key={entry.field} value={entry.field}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={leaf.operator} disabled={editor.locked || spec === undefined} onValueChange={(operator) => editor.replace(path, withOperator(leaf, spec, operator))}>
          <SelectTrigger id={`${id}-operator`} className="w-44" aria-label={t('console.segmentConditions.operator')} aria-invalid={flagOperator || undefined} aria-describedby={flagOperator ? problemId : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {t(operatorKey(operator, spec?.type))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ConditionValue
          id={`${id}-value`}
          spec={spec}
          operator={leaf.operator}
          value={leaf.value}
          invalid={flagValue}
          describedBy={flagValue ? problemId : undefined}
          onChange={(value) => editor.replace(path, { ...leaf, value })}
        />
        <NodeActions path={path} siblings={siblings} name={name} />
      </div>
      <NodeProblems id={problemId} problems={problems} />
    </div>
  );
}
