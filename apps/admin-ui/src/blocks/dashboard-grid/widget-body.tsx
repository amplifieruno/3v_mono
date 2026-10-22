import { formatEntityRef, validatePlacementProps } from '@burojs/core';
import * as React from 'react';
import { ANALYTIC_BLOCKS, type AnalyticBlockName } from '../../modules/analytics/widget-blocks';
import { useBlockT } from './block-t';
import { HealthChartWidget, OccupancyNowWidget, PlainWidget, type WidgetBlockView } from './widget-data';
import { WIDGET_VIEWS } from './widget-views';

export interface WidgetBodyProps {
  readonly entry: AnalyticBlockName;
  /** The block's props from the widget's settings (facility already filled in). */
  readonly props: Readonly<Record<string, unknown>>;
  readonly loading: string;
  /** Draws a refusal of the block's own prop schemas. */
  readonly invalid: (reason: string) => React.ReactElement;
}

/**
 * The analytic block a widget names, drawn by the dashboard itself (a placement cannot be chosen
 * from data, gap G60): its props checked against the block's own schemas with their defaults
 * (`validatePlacementProps`, as a placement mounts), its registered view (`./widget-views.ts`) and its
 * texts as a placement would hand them; the blocks with `data` entries get them read here.
 */
export function WidgetBody({ entry, props, loading, invalid }: WidgetBodyProps): React.ReactElement {
  const { block } = ANALYTIC_BLOCKS[entry];
  const id = formatEntityRef(block.ref);
  const t = useBlockT(id);
  // Compared by value: the tile builds a new props object on every render.
  const key = JSON.stringify(props);
  const checked = React.useMemo(
    () => validatePlacementProps(block as Parameters<typeof validatePlacementProps>[0], JSON.parse(key) as Record<string, unknown>),
    [block, key],
  );
  if (checked.status === 'failed') return invalid(`${checked.prop}: ${checked.reason}`);
  if (checked.status === 'pending') return <p className="text-sm text-muted-foreground">{loading}</p>;
  const View = WIDGET_VIEWS[entry].component as WidgetBlockView | undefined;
  if (View === undefined) return invalid(`${id} has no view`);
  const data = { View, props: checked.props, t, loading };
  if (entry === 'occupancyNow') return <OccupancyNowWidget {...data} />;
  if (entry === 'deviceHealthChart') return <HealthChartWidget {...data} />;
  return <PlainWidget {...data} />;
}
