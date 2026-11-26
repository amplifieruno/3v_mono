import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useList } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import { Cctv } from 'lucide-react';
import type * as React from 'react';
import { z } from 'zod';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { liveCameraOf } from './live-camera-row';
import { LIVE_WALL_LIMIT, LIVE_WALL_REFRESH_MS, type liveWallBlock } from './live-wall-block';
import { useEnumLabel } from '../charts/use-enum-label';
import { EVENT_TYPE_ENUM } from '../../enums/events';
import { useLiveDeps } from './use-live-deps';
import { useNow } from './use-now';
import { tileAlerts, useWallAlerts } from './use-wall-alerts';
import { WallAlertsPanel } from './wall-alerts';
import { WallTile } from './wall-tile';

const areaOf = z.object({ 'area_id.name': z.string().nullable().optional() });

/**
 * The live wall's view (`itap:live-wall`), loaded on demand: the camera tiles of every camera
 * running recognition and, beside them, the alert feed that lights the tiles. The camera list is
 * read again every 15 seconds (sidebar facility scope applies).
 */
export default function LiveWallView({ props, t }: BlockViewProps<typeof liveWallBlock>): React.ReactElement {
  const deps = useLiveDeps();
  const app = useApp();
  const now = useNow();
  const withAlerts = props.alerts !== false;
  const feed = useWallAlerts(withAlerts);
  const typeLabel = useEnumLabel(EVENT_TYPE_ENUM);
  const read = useList(DEVICE_RESOURCE, {
    // Only cameras run recognition (the start action refuses other devices).
    filter: { field: 'recognition_enabled', op: 'eq', value: true },
    sort: [{ field: 'name', direction: 'asc' }],
    pagination: { kind: 'offset', page: 1, pageSize: LIVE_WALL_LIMIT },
    relationColumns: ['area_id.name'],
    refetchInterval: LIVE_WALL_REFRESH_MS,
  });
  if (read.isError && read.data === undefined) return <p className="text-sm text-destructive">{t('camerasFailed')}</p>;
  if (read.data === undefined) return <p className="text-sm text-muted-foreground">{t('loadingCameras')}</p>;
  const list = read.data as { readonly data?: readonly unknown[]; readonly total?: unknown } | undefined;
  const cameras = (list?.data ?? []).flatMap((row) => {
    const camera = liveCameraOf(row);
    return camera ? [{ camera, area: areaOf.safeParse(row).data?.['area_id.name'] ?? null }] : [];
  });
  if (cameras.length === 0) return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  const total = typeof list?.total === 'number' ? list.total : cameras.length;
  const def = app.registry.get(DEVICE_RESOURCE);
  const lit = tileAlerts(feed.alerts, now);
  return (
    <div className="flex flex-col gap-3" data-testid="live-wall">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Cctv className="size-4" aria-hidden />
          {t('cameras', { params: { count: cameras.length } })}
          {total > cameras.length ? ` · ${t('truncated', { params: { shown: cameras.length, total } })}` : null}
        </span>
        <time
          aria-label={t('clock')}
          className="font-mono text-sm font-medium tabular-nums"
          dateTime={new Date(now).toISOString()}
        >
          {new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>
      <div className={cn('grid gap-4', withAlerts && 'xl:grid-cols-[minmax(0,1fr)_20rem]')}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cameras.map(({ camera, area }) => {
            const alert = lit.get(camera.id);
            return (
              <WallTile
                key={camera.id}
                device={camera}
                area={area}
                href={resourceShowHref(app.registry, def, DEVICE_RESOURCE, camera.id)}
                deps={deps}
                t={t}
                alert={alert ? { label: typeLabel(alert.type), at: alert.at } : null}
              />
            );
          })}
        </ul>
        {withAlerts ? (
          // The feed is as tall as the camera grid beside it and scrolls inside.
          <div className="relative min-h-96">
            <div className="flex h-full flex-col xl:absolute xl:inset-0">
              <WallAlertsPanel feed={feed} now={now} t={t} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
