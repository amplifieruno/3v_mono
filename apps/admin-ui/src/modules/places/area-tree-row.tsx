import { Button, EnumBadge, cn, useLinkComponent } from '@burojs/ui-shadcn';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type * as React from 'react';
import { AREA_TYPE_ENUM } from '../../enums/places';
import type { AreaTreeNode } from './area-tree';

/** Indentation per tree level; deeper levels keep the last step (class names must be literal). */
const INDENT = ['pl-0', 'pl-6', 'pl-12', 'pl-18', 'pl-24', 'pl-30', 'pl-36'] as const;

export interface AreaTreeRowProps {
  readonly node: AreaTreeNode;
  readonly collapsed: boolean;
  readonly showHref: string;
  readonly addInsideHref: string;
  readonly onToggle: () => void;
  readonly t: (key: string, options?: { readonly params?: Record<string, unknown> }) => string;
}

/** One area of the facility tree: toggle, name link, type badge, occupancy and "add inside". */
export function AreaTreeRow({
  node,
  collapsed,
  showHref,
  addInsideHref,
  onToggle,
  t,
}: AreaTreeRowProps): React.ReactElement {
  const Link = useLinkComponent();
  const { area, level, children } = node;
  const occupancy = area.current_occupancy ?? 0;
  const over = area.capacity !== null && occupancy > area.capacity;
  const name = { params: { name: area.name } };
  return (
    <li
      data-testid={`area-tree-row:${area.id}`}
      data-level={level}
      className={cn(
        'flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/50',
        INDENT[Math.min(level, INDENT.length - 1)],
      )}
    >
      {children.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'expand' : 'collapse', name)}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}
      <Link href={showHref} className="truncate font-medium hover:underline">
        {area.name}
      </Link>
      <EnumBadge enumName={AREA_TYPE_ENUM} value={area.area_type} />
      <span
        className={cn('ml-auto text-sm tabular-nums', over ? 'text-destructive' : 'text-muted-foreground')}
        title={over ? t('overCapacity') : undefined}
      >
        {area.capacity === null
          ? t('occupancyOnly', { params: { occupancy } })
          : t('occupancy', { params: { occupancy, capacity: area.capacity } })}
      </span>
      <Button asChild variant="ghost" size="icon" className="size-6">
        <Link href={addInsideHref} aria-label={t('addInside', name)} title={t('addInside', name)}>
          <Plus className="size-4" />
        </Link>
      </Button>
    </li>
  );
}
