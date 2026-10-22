import type { PlanAreaRow } from '../../fields/plan-rows';

/** The block's `t`, as its view receives it. */
export type FloorPlanT = (
  key: string,
  options?: { readonly params?: Record<string, unknown> },
) => string;

/** Whether more people are inside than the area holds. */
export const isOverCapacity = (area: PlanAreaRow): boolean =>
  area.capacity !== null && (area.current_occupancy ?? 0) > area.capacity;

/** "3 / 12" against a capacity, "3 inside" without one. */
export function occupancyText(area: PlanAreaRow, t: FloorPlanT): string {
  const occupancy = area.current_occupancy ?? 0;
  return area.capacity === null
    ? t('occupancyOnly', { params: { occupancy } })
    : t('occupancy', { params: { occupancy, capacity: area.capacity } });
}
