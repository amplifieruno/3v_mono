import { useCustomQuery } from '@burojs/react';
import { type DayWindow, dayWindow } from '../charts/period';
import { type FacilityZone, facilityZoneQuery } from './facility-zone-query';

/** Where a facility block stands before its stats are read. */
export type FacilityPeriod =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly facility: FacilityZone; readonly now: Date; readonly window: DayWindow };

/**
 * A facility's zone and the last `days` days of it: `none` without a facility (the sidebar shows
 * all facilities), `missing` for one the session cannot read. The clock is the moment the facility
 * was read, so the period (and the stats query's input) stays put until the facility is read again.
 */
export function useFacilityPeriod(facilityId: string | null, days: number): FacilityPeriod {
  const zone = useCustomQuery(facilityZoneQuery, { facilityId: facilityId ?? '' }, { enabled: facilityId !== null });
  if (facilityId === null) return { status: 'none' };
  if (zone.isError) return { status: 'failed' };
  if (zone.data === undefined) return { status: 'loading' };
  if (zone.data === null) return { status: 'missing' };
  const now = new Date(zone.dataUpdatedAt);
  return { status: 'ready', facility: zone.data, now, window: dayWindow(now, zone.data.timezone, days) };
}
