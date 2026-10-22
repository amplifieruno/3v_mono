import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { countTemplateNodes, templateNodesOf } from './template-structure-format';
import type { TemplateStructureMeta } from './template-structure-meta';
import { TemplateTree } from './template-tree';

/** The template's areas as a tree, with how many areas applying it creates. */
export function TemplateStructureDisplay(
  props: ScalarDisplayProps<unknown, TemplateStructureMeta>,
): React.ReactElement {
  const t = useT();
  const nodes = templateNodesOf(props.value);
  if (nodes.length === 0) return <span className="text-muted-foreground">—</span>;
  const count = countTemplateNodes(nodes);
  return (
    <div className="flex flex-col gap-2" data-testid={props.testIds.display}>
      <TemplateTree nodes={nodes} label={t('console.templateStructure.tree')} />
      <p className="text-xs text-muted-foreground">
        {t('console.templateStructure.count', { params: { count } })}
      </p>
    </div>
  );
}
