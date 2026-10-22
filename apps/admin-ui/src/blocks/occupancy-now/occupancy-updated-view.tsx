import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { workspaceOccupancyFacts } from '../../modules/monitoring/operator-workspace-query';
import { OCCUPANCY_REFRESH_MS } from './occupancy-now-view';
import type { occupancyUpdatedBlock } from './occupancy-updated-block';

/** Polls the workspace's occupancy figures (shared with the facts block) and shows when they were read. */
export function OccupancyUpdatedView({ props, t }: BlockViewProps<typeof occupancyUpdatedBlock>): React.ReactElement | null {
  const facilityId = props.facilityId ?? null;
  const figures = useCustomQuery(workspaceOccupancyFacts, { facilityId: facilityId ?? '' }, {
    enabled: facilityId !== null,
    refetchInterval: OCCUPANCY_REFRESH_MS,
  });
  if (facilityId === null || figures.dataUpdatedAt === 0) return null;
  const time = new Date(figures.dataUpdatedAt).toLocaleTimeString();
  return <p className="text-xs text-muted-foreground">{t('updated', { params: { time } })}</p>;
}
