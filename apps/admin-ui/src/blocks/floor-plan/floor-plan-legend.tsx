import { EnumBadge, cn, useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { AREA_ACCESS_LEVEL_ENUM } from '../../enums/places';
import type { PlanAreaRow } from '../../fields/plan-rows';
import { type FloorPlanT, isOverCapacity, occupancyText } from './floor-plan-occupancy';
import { accessLevelStyle } from './floor-plan-style';

export interface FloorPlanLegendProps {
  readonly areas: readonly PlanAreaRow[];
  readonly hrefOf: (areaId: string) => string;
  readonly t: FloorPlanT;
}

/** The areas drawn on the plan: colour swatch, link to the area, access level and occupancy. */
export function FloorPlanLegend({ areas, hrefOf, t }: FloorPlanLegendProps): React.ReactElement {
  const Link = useLinkComponent();
  return (
    <ul aria-label={t('legend')} className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {areas.map((area) => {
        const over = isOverCapacity(area);
        return (
          <li key={area.id} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={cn(
                'size-3 shrink-0 rounded-sm',
                accessLevelStyle(area.access_level).swatch,
              )}
            />
            <Link href={hrefOf(area.id)} className="truncate font-medium hover:underline">
              {area.name}
            </Link>
            {area.access_level ? (
              <EnumBadge enumName={AREA_ACCESS_LEVEL_ENUM} value={area.access_level} />
            ) : null}
            <span
              className={cn(
                'ml-auto tabular-nums',
                over ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {occupancyText(area, t)}
              {over ? <span className="sr-only"> {t('overCapacity')}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
