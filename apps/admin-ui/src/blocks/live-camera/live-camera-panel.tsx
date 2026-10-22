import { Button, cn } from '@burojs/ui-shadcn';
import { LoaderCircle, VideoOff } from 'lucide-react';
import * as React from 'react';
import { DetectionOverlay } from './detection-overlay';
import type { StreamAttacher } from './hls-player';
import type { LiveCameraT } from './live-camera-texts';
import { LiveCounters } from './live-counters';
import { LiveStatus } from './live-status';
import { StreamNote } from './stream-note';
import { livePlaylistUrl } from './stream-url';
import { type DetectionDeps, useDetections } from './use-detections';
import { useStreamPlayback } from './use-stream-playback';

/** The camera columns the live view reads. */
export interface LiveCameraDevice {
  readonly id: string;
  readonly name: string;
  readonly stream_url: string | null;
  readonly recognition_enabled: boolean;
}

/** Everything the live view talks to: the player and the detection socket. */
export interface LiveCameraDeps extends DetectionDeps {
  readonly attach: StreamAttacher;
}

export interface LiveCameraPanelProps {
  readonly device: LiveCameraDevice;
  readonly deps: LiveCameraDeps;
  readonly t: LiveCameraT;
  /** Drawn left of the status badges (the live wall puts the camera's linked name there). */
  readonly heading?: React.ReactNode;
}

/**
 * One camera live: its HLS stream from the stream-server with the recognised faces drawn over
 * it, the state of the stream and of the detection socket, and the detections counted since the
 * view opened. A camera without a stream address, a stream still starting and a stream that is
 * down each get a clear note over the picture area instead of a black box.
 */
export function LiveCameraPanel({ device, deps, t, heading }: LiveCameraPanelProps): React.ReactElement {
  const url = livePlaylistUrl(device.stream_url);
  const playback = useStreamPlayback(url, deps.attach);
  const live = useDetections(device.id, deps);
  const params = { params: { name: device.name } };
  const failure =
    live.state.status === 'failed'
      ? `error_${live.state.error}`
      : live.state.status === 'unavailable'
        ? 'error_unavailable'
        : null;

  return (
    <section className="flex flex-col gap-2" data-testid="live-camera" aria-label={t('video', params)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ?? <span />}
        <LiveStatus stream={url === null ? null : playback.state} detections={live.state} t={t} />
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
        {url === null ? null : (
          <video
            ref={playback.videoRef}
            muted
            autoPlay
            playsInline
            aria-label={t('video', params)}
            className={cn(
              'absolute inset-0 size-full bg-black object-contain',
              playback.state !== 'playing' && 'invisible',
            )}
          />
        )}
        {url !== null && playback.state === 'playing' ? (
          <DetectionOverlay boxes={live.boxes} name={device.name} t={t} />
        ) : null}
        {url === null ? (
          <StreamNote icon={<VideoOff className="size-8" aria-hidden />} title={t('noStream')} />
        ) : playback.state === 'loading' ? (
          <StreamNote
            icon={<LoaderCircle className="size-6 animate-spin" aria-hidden />}
            title={t('loading')}
          />
        ) : playback.state === 'unavailable' ? (
          <StreamNote
            icon={<VideoOff className="size-8" aria-hidden />}
            title={t('unavailable')}
            hint={t('unavailableHint')}
            action={
              <Button size="sm" variant="outline" onClick={playback.retry}>
                {t('retry')}
              </Button>
            }
          />
        ) : null}
      </div>
      {failure ? <p className="text-sm text-destructive">{t(failure)}</p> : null}
      {device.recognition_enabled ? null : (
        <p className="text-sm text-muted-foreground">{t('recognitionOff')}</p>
      )}
      <LiveCounters counters={live.counters} t={t} />
    </section>
  );
}
