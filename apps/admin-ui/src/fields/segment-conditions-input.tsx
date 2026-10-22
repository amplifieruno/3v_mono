import { type ScalarInputProps, resolveValidationMessage, useCustomQuery, useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { ListPlus, Plus } from 'lucide-react';
import * as React from 'react';
import { problemKey } from './field-issue';
import { ConditionNode } from './segment-condition-node';
import { type ConditionsEditor, ConditionsEditorContext } from './segment-conditions-context';
import { conditionsSentence } from './segment-conditions-format';
import { type SegmentConditionsMeta, targetOf } from './segment-conditions-meta';
import { catalogOf, newLeaf } from './segment-conditions-operators';
import { type PathPart, issueJsonPath, ownerOf, targetOfPath } from './segment-conditions-path';
import { segmentConditionsCatalog } from './segment-conditions-query';
import { publishConditions } from './segment-conditions-registry';
import { addChild, isEmptyConditions, isGroup, moveAt, removeAt, replaceAt, setGroupOp } from './segment-conditions-tree';
import { validateSegmentConditions } from './segment-conditions-validate';

/** The problem texts by the JSON path of their node: the editor's own checks, then the form's issues. */
function useProblems(
  value: unknown,
  ctx: Parameters<typeof validateSegmentConditions>[1],
  issues: ScalarInputProps<unknown>['issues'],
): { readonly problemsAt: (jsonPath: string) => readonly string[]; readonly partsAt: (jsonPath: string) => ReadonlySet<PathPart> } {
  const t = useT();
  const byNode = new Map<string, string[]>();
  const partsByNode = new Map<string, Set<PathPart>>();
  const put = (path: string | null, text: string) => {
    const owner = path === null ? null : ownerOf(path);
    if (owner === null || path === null) return;
    const part = targetOfPath(path)?.part;
    if (part !== undefined) partsByNode.set(owner, (partsByNode.get(owner) ?? new Set<PathPart>()).add(part));
    const list = byNode.get(owner) ?? [];
    if (!list.includes(text)) list.push(text);
    byNode.set(owner, list);
  };
  for (const problem of validateSegmentConditions(value, ctx)) {
    put(problem.path, t(problemKey(problem.code), { params: problem.params ?? {} }));
  }
  for (const issue of issues) put(issueJsonPath(issue), resolveValidationMessage(issue, { t }));
  return { problemsAt: (jsonPath) => byNode.get(jsonPath) ?? [], partsAt: (jsonPath) => partsByNode.get(jsonPath) ?? new Set<PathPart>() };
}

/**
 * The conditions of a segment (or template) as a tree editor over the catalog of the record's
 * target (`segment_fields`): groups (all / any / not) with their conditions, added, moved and
 * removed in place, each condition with the value editor of its field's type. Every node shows its
 * problems (the client checks of the database's validator, and any issue the form names with a
 * condition path); a field the catalog no longer offers stays, flagged. While mounted, the editor
 * publishes its catalog for the field's validator.
 */
export function SegmentConditionsInput(props: ScalarInputProps<unknown, SegmentConditionsMeta>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, meta, issues } = props;
  const t = useT();
  const target = targetOf(props, meta.targetField);
  const query = useCustomQuery(segmentConditionsCatalog, { target: target ?? '' }, { enabled: target !== undefined });
  const data = query.data;
  const catalog = React.useMemo(() => (data === undefined ? undefined : catalogOf(data.fields)), [data]);
  const recordId = props.record?.id;
  const self = typeof recordId === 'string' ? recordId : undefined;
  React.useEffect(() => {
    if (target === undefined || catalog === undefined || data === undefined) return undefined;
    return publishConditions({ target, catalog, refs: data.refs, self });
  }, [target, catalog, data, self]);
  const { problemsAt, partsAt } = useProblems(value, { catalog, refs: data?.refs, target, self }, issues);

  if (target === undefined) return <p className="text-sm text-muted-foreground">{t('console.segmentConditions.noTarget')}</p>;
  if (query.isError) return <p className="text-sm text-destructive">{t('console.segmentConditions.failed')}</p>;
  if (data === undefined || catalog === undefined) {
    return <p className="text-sm text-muted-foreground">{t('console.segmentConditions.loading')}</p>;
  }
  const write = (next: unknown) => onChange?.(next);
  const editor: ConditionsEditor = {
    catalog,
    refs: data.refs,
    target,
    self,
    locked: disabled === true || readOnly === true,
    prefix: accessibility.input ?? 'segment-conditions',
    problemsAt,
    partsAt,
    replace: (path, next) => write(replaceAt(value, path, next)),
    remove: (path) => write(removeAt(value, path)),
    move: (path, delta) => write(moveAt(value, path, delta)),
    add: (path, kind) => write(addChild(value, path, kind === 'leaf' ? newLeaf(catalog) : { op: 'and', children: [newLeaf(catalog)] })),
    setOp: (path, op) => write(setGroupOp(value, path, op)),
    ...(onBlur === undefined ? {} : { onBlur }),
  };
  const empty = isEmptyConditions(value);
  return (
    <ConditionsEditorContext.Provider value={editor}>
      <div
        className="flex flex-col gap-3"
        {...(accessibility.input === undefined ? {} : { id: accessibility.input })}
        data-testid={testIds.input}
        aria-describedby={accessibility.description}
      >
        {empty ? (
          <p className="text-sm text-muted-foreground">{t('console.segmentConditions.empty')}</p>
        ) : (
          <>
            <p className="text-sm" data-testid={`${editor.prefix}-sentence`}>
              <span className="text-muted-foreground">{t('console.segmentConditions.reads')} </span>
              {conditionsSentence(value, { catalog, refs: data.refs, t })}
            </p>
            <ConditionNode node={value} path={[]} siblings={1} />
          </>
        )}
        {!isGroup(value) && !editor.locked ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => editor.add([], 'leaf')}>
              <Plus className="size-4" aria-hidden />
              {t('console.segmentConditions.addCondition')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => editor.add([], 'group')}>
              <ListPlus className="size-4" aria-hidden />
              {t('console.segmentConditions.addGroup')}
            </Button>
          </div>
        ) : null}
      </div>
    </ConditionsEditorContext.Provider>
  );
}
