import type { BlockViewProps } from '@burojs/react';
import type * as React from 'react';
import type { liveCameraBlock } from './live-camera-block';
import { LiveCameraPanel } from './live-camera-panel';
import { liveCameraOf } from './live-camera-row';
import { useLiveDeps } from './use-live-deps';

/**
 * The live camera block's view (`itap:live-camera`), loaded on demand: the camera read by the
 * block, live with its detections.
 */
export default function LiveCameraView({
  data,
  t,
}: BlockViewProps<typeof liveCameraBlock>): React.ReactElement {
  const deps = useLiveDeps();
  const device = liveCameraOf((data as { readonly device?: unknown }).device);
  if (!device) return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  return <LiveCameraPanel key={device.id} device={device} deps={deps} t={t} />;
}
