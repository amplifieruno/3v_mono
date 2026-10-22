import { Badge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { LiveCameraT } from './live-camera-texts';
import type { LiveDetectionsState } from './use-detections';
import type { PlaybackState } from './use-stream-playback';

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary';

const STREAM_VARIANT: Readonly<Record<PlaybackState, BadgeVariant>> = {
  loading: 'secondary',
  playing: 'success',
  unavailable: 'destructive',
};

const DETECTIONS_VARIANT: Readonly<Record<LiveDetectionsState['status'], BadgeVariant>> = {
  connecting: 'secondary',
  live: 'success',
  reconnecting: 'warning',
  failed: 'destructive',
  unavailable: 'destructive',
};

export interface LiveStatusProps {
  /** `null` for a camera without a stream address. */
  readonly stream: PlaybackState | null;
  readonly detections: LiveDetectionsState;
  readonly t: LiveCameraT;
}

/** Where the stream and the detection socket are, as two badges. */
export function LiveStatus({ stream, detections, t }: LiveStatusProps): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-2" data-testid="live-status">
      {stream === null ? null : <Badge variant={STREAM_VARIANT[stream]}>{t(`stream_${stream}`)}</Badge>}
      <Badge variant={DETECTIONS_VARIANT[detections.status]}>{t(`detections_${detections.status}`)}</Badge>
    </div>
  );
}
