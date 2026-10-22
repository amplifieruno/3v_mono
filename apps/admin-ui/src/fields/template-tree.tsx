import { useT } from '@burojs/react';
import { EnumBadge, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { AREA_ACCESS_LEVEL_ENUM, AREA_TYPE_ENUM } from '../enums/places';
import type { TemplateNode } from './template-structure-format';

/** Indentation per level (class names must be literal); deeper levels keep the last step. */
const INDENT = ['pl-0', 'pl-5', 'pl-10', 'pl-15', 'pl-20', 'pl-25'] as const;

interface Row {
  readonly node: TemplateNode;
  readonly level: number;
  readonly key: string;
}

const flatten = (nodes: readonly TemplateNode[], level: number, prefix: string): Row[] =>
  nodes.flatMap((node, index) => {
    const key = `${prefix}${index + 1}`;
    return [{ node, level, key }, ...flatten(node.children, level + 1, `${key}.`)];
  });

export interface TemplateTreeProps {
  readonly nodes: readonly TemplateNode[];
  readonly label: string;
  readonly testId?: string;
}

/**
 * The areas of a facility template as an indented, read-only tree: name, type, access level
 * (when set) and capacity (when set), in template order.
 */
export function TemplateTree({ nodes, label, testId }: TemplateTreeProps): React.ReactElement {
  const t = useT();
  return (
    <ul aria-label={label} data-testid={testId} className="flex flex-col gap-1 text-sm">
      {flatten(nodes, 0, '').map(({ node, level, key }) => (
        <li
          key={key}
          data-level={level}
          className={cn('flex flex-wrap items-center gap-2', INDENT[Math.min(level, INDENT.length - 1)])}
        >
          <span className="font-medium">{node.name}</span>
          <EnumBadge enumName={AREA_TYPE_ENUM} value={node.area_type} />
          {node.access_level === null ? null : (
            <EnumBadge enumName={AREA_ACCESS_LEVEL_ENUM} value={node.access_level} />
          )}
          {node.capacity === null ? null : (
            <span className="text-muted-foreground tabular-nums">
              {t('console.templateStructure.capacity', { params: { capacity: node.capacity } })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
