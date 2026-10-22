import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useList } from '@burojs/react';
import { useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { LiveCameraPanel } from './live-camera-panel';
import { liveCameraOf } from './live-camera-row';
import { LIVE_WALL_LIMIT, LIVE_WALL_REFRESH_MS, type liveWallBlock } from './live-wall-block';
import { useLiveDeps } from './use-live-deps';

/**
 * The live wall's view (`itap:live-wall`), loaded on demand: one live camera view per camera
 * running recognition, each headed by the camera's name linking to its page. The camera list is
 * read again every 15 seconds (sidebar facility scope applies).
 */
export default function LiveWallView({ t }: BlockViewProps<typeof liveWallBlock>): React.ReactElement {
  const deps = useLiveDeps();
  const app = useApp();
  const Link = useLinkComponent();
  const read = useList(DEVICE_RESOURCE, {
    // Only cameras run recognition (the start action refuses other devices).
    filter: { field: 'recognition_enabled', op: 'eq', value: true },
    sort: [{ field: 'name', direction: 'asc' }],
    pagination: { kind: 'offset', page: 1, pageSize: LIVE_WALL_LIMIT },
    refetchInterval: LIVE_WALL_REFRESH_MS,
  });
  if (read.isError && read.data === undefined) return <p className="text-sm text-destructive">{t('camerasFailed')}</p>;
  if (read.data === undefined) return <p className="text-sm text-muted-foreground">{t('loadingCameras')}</p>;
  const list = read.data as { readonly data?: readonly unknown[]; readonly total?: unknown } | undefined;
  const cameras = (list?.data ?? []).flatMap((row) => {
    const camera = liveCameraOf(row);
    return camera ? [camera] : [];
  });
  if (cameras.length === 0) return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  const total = typeof list?.total === 'number' ? list.total : cameras.length;
  const def = app.registry.get(DEVICE_RESOURCE);
  return (
    <div className="flex flex-col gap-3" data-testid="live-wall">
      {total > cameras.length ? (
        <p className="text-xs text-muted-foreground">
          {t('truncated', { params: { shown: cameras.length, total } })}
        </p>
      ) : null}
      <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {cameras.map((camera) => (
          <li key={camera.id} className="rounded-lg border p-3">
            <LiveCameraPanel
              device={camera}
              deps={deps}
              t={t}
              heading={
                <Link
                  href={resourceShowHref(app.registry, def, DEVICE_RESOURCE, camera.id)}
                  className="font-medium hover:underline"
                >
                  {camera.name}
                </Link>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
