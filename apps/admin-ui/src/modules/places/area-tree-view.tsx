import type { InferBlockData } from '@burojs/core';
import { hrefFor, resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp } from '@burojs/react';
import { Button, useLinkComponent } from '@burojs/ui-shadcn';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { type AreaTreeRow as Row, branchIds, buildAreaTree, visibleNodes } from './area-tree';
import type { areaTreeBlock } from './area-tree-block';
import { AreaTreeRow } from './area-tree-row';
import { AREA_RESOURCE } from '../../data/resource-names';

/**
 * The facility's area tree (`itap:area-tree`): every level open at first; a branch's
 * toggle hides its sub-areas. Rows come from the block's one `source.list` read.
 */
export function AreaTreeView({
  props,
  data,
  t,
}: BlockViewProps<typeof areaTreeBlock>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const { areas } = data as InferBlockData<typeof areaTreeBlock>;
  const rows = areas.rows as unknown as readonly Row[];
  const tree = React.useMemo(() => buildAreaTree(rows), [rows]);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
  const def = app.registry.get(AREA_RESOURCE);
  const createHref = (query: Record<string, string>): string =>
    hrefFor(app.registry, AREA_RESOURCE, { action: 'create', query });
  const toggle = (id: string): void =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const total = typeof areas.total === 'number' ? areas.total : rows.length;

  return (
    <div data-testid="area-tree" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={createHref({ 'prefill.facility_id': props.facilityId })}>
            <Plus className="size-4" aria-hidden />
            {t('add')}
          </Link>
        </Button>
        {tree.some((node) => node.children.length > 0) ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setCollapsed(new Set())}>
              {t('expandAll')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCollapsed(new Set(branchIds(tree)))}
            >
              {t('collapseAll')}
            </Button>
          </>
        ) : null}
      </div>
      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col" aria-label={t('label')}>
          {visibleNodes(tree, collapsed).map((node) => (
            <AreaTreeRow
              key={node.area.id}
              node={node}
              collapsed={collapsed.has(node.area.id)}
              showHref={resourceShowHref(app.registry, def, AREA_RESOURCE, node.area.id)}
              addInsideHref={createHref({
                'prefill.facility_id': props.facilityId,
                'prefill.parent_id': node.area.id,
              })}
              onToggle={() => toggle(node.area.id)}
              t={t}
            />
          ))}
        </ul>
      )}
      {total > rows.length ? (
        <p className="text-sm text-muted-foreground">
          {t('truncated', { params: { shown: rows.length, total } })}
        </p>
      ) : null}
    </div>
  );
}
