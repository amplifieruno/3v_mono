import { cn, useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { type AreaOccupancyEntry, OCCUPANCY_LEVEL_CLASSES } from './occupancy-level';

/** Indentation per tree depth (class names must be literal); deeper levels share the last. */
const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16'] as const;

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface OccupancyAreaListProps {
  readonly entries: readonly AreaOccupancyEntry[];
  readonly hrefOf: (areaId: string) => string;
  readonly t: T;
}

/** Every area of the facility in tree order: its level swatch, link, people against capacity. */
export function OccupancyAreaList({ entries, hrefOf, t }: OccupancyAreaListProps): React.ReactElement {
  const Link = useLinkComponent();
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t('noAreas')}</p>;
  return (
    <ul aria-label={t('areas')} className="flex flex-col divide-y rounded-md border" data-testid="occupancy-areas">
      {entries.map(({ row, depth, level }) => {
        const over = level === 'over';
        const figure =
          row.capacity === null
            ? t('occupancyOnly', { params: { occupancy: row.occupancy } })
            : t('occupancy', { params: { occupancy: row.occupancy, capacity: row.capacity } });
        return (
          <li
            key={row.area_id}
            className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm"
            data-testid={`occupancy-area:${row.area_id}`}
          >
            <span className={cn('flex min-w-0 flex-1 items-center gap-2', INDENT[Math.min(depth, INDENT.length - 1)])}>
              <span
                aria-hidden
                className={cn('size-3 shrink-0 rounded-sm', OCCUPANCY_LEVEL_CLASSES[level].swatch)}
              />
              <Link href={hrefOf(row.area_id)} className="truncate font-medium hover:underline">
                {row.name}
              </Link>
            </span>
            {row.direct_occupancy > 0 && row.direct_occupancy < row.occupancy ? (
              <span className="text-xs text-muted-foreground">
                {t('direct', { params: { count: row.direct_occupancy } })}
              </span>
            ) : null}
            <span className={cn('tabular-nums', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {figure}
              <span className="sr-only"> {t(`level_${level}`)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
