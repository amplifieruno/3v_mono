import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { OCCUPANCY_LEVELS, OCCUPANCY_LEVEL_CLASSES } from './occupancy-level';

type T = (key: string) => string;

/** What each colour of the plan means. */
export function OccupancyLegend({ t }: { readonly t: T }): React.ReactElement {
  return (
    <ul aria-label={t('legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {OCCUPANCY_LEVELS.map((level) => (
        <li key={level} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3 rounded-sm', OCCUPANCY_LEVEL_CLASSES[level].swatch)} />
          {t(`level_${level}`)}
        </li>
      ))}
    </ul>
  );
}
