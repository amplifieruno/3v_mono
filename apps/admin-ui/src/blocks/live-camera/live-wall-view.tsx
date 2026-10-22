import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp } from '@burojs/react';
import { useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { LiveCameraPanel } from './live-camera-panel';
import { liveCameraOf } from './live-camera-row';
import type { liveWallBlock } from './live-wall-block';
import { useLiveDeps } from './use-live-deps';

/**
 * The live wall's view (`itap:live-wall`), loaded on demand: one live camera view per camera
 * running recognition, each headed by the camera's name linking to its page.
 */
export default function LiveWallView({
  data,
  t,
}: BlockViewProps<typeof liveWallBlock>): React.ReactElement {
  const deps = useLiveDeps();
  const app = useApp();
  const Link = useLinkComponent();
  const list = (data as { readonly cameras?: { readonly rows?: readonly unknown[]; readonly total?: unknown } })
    .cameras;
  const cameras = (list?.rows ?? []).flatMap((row) => {
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
