import { type BlockViewProps, useCustomQuery, useList } from '@burojs/react';
import type * as React from 'react';
import { AREA_RESOURCE, FLOOR_PLAN_RESOURCE } from '../../data/resource-names';
import { PLAN_AREA_LIMIT } from '../../fields/plan-rows';
import { deviceHealthSeries } from '../health-chart/health-series-query';
import type { BlockT } from './block-t';

/** A block view as the dashboard draws it: its props, its `data` entries and its `t`. */
export type WidgetBlockView = React.ComponentType<BlockViewProps<unknown>>;

export interface WidgetDataProps {
  readonly View: WidgetBlockView;
  readonly props: Readonly<Record<string, unknown>>;
  readonly t: BlockT;
  readonly loading: string;
}

/** A view's props as `BlockViewProps<unknown>` (the dashboard holds every block's props as a record). */
const viewProps = (props: Readonly<Record<string, unknown>>, data: Readonly<Record<string, unknown>>, t: BlockT) =>
  ({ props, data, t }) as unknown as BlockViewProps<unknown>;

/** A block without `data` entries: its view reads what it needs itself. */
export function PlainWidget({ View, props, t }: WidgetDataProps): React.ReactElement {
  return <View {...viewProps(props, {}, t)} />;
}

const listOf = (read: { readonly data?: unknown }) => {
  const list = read.data as { readonly data?: readonly unknown[]; readonly total?: number } | undefined;
  return list === undefined ? undefined : { rows: list.data ?? [], total: list.total };
};

/**
 * `itap:occupancy-now`'s `data` (the facility's floor plans and areas, as its placement reads them
 * with `source.list`), read here for a view the dashboard draws itself (gap G60).
 */
export function OccupancyNowWidget({ View, props, t, loading }: WidgetDataProps): React.ReactElement {
  const facilityId = typeof props.facilityId === 'string' ? props.facilityId : '';
  const filter = { field: 'facility_id', op: 'eq', value: facilityId } as const;
  const pagination = { kind: 'offset', page: 1, pageSize: PLAN_AREA_LIMIT } as const;
  const plans = useList(FLOOR_PLAN_RESOURCE, { scope: 'none', filter, sort: [{ field: 'name', direction: 'asc' }], pagination });
  const areas = useList(AREA_RESOURCE, { scope: 'none', filter, sort: [{ field: 'path', direction: 'asc' }], pagination });
  const data = { plans: listOf(plans), areas: listOf(areas) };
  if (data.plans === undefined || data.areas === undefined) return <p className="text-sm text-muted-foreground">{loading}</p>;
  return <View {...viewProps(props, data, t)} />;
}

/** `itap:health-chart`'s `data` (one device's last 24 hours), read here for the dashboard (gap G60). */
export function HealthChartWidget({ View, props, t, loading }: WidgetDataProps): React.ReactElement {
  const deviceId = typeof props.deviceId === 'string' ? props.deviceId : '';
  const series = useCustomQuery(deviceHealthSeries, { deviceId }, { enabled: deviceId !== '' });
  if (series.data === undefined && !series.isError) return <p className="text-sm text-muted-foreground">{loading}</p>;
  return <View {...viewProps(props, { series: series.data ?? null }, t)} />;
}
