import { useLinkComponent, cn } from '@burojs/ui-shadcn';
import { LoaderCircle, Siren, VideoOff } from 'lucide-react';
import type * as React from 'react';
import { DetectionOverlay } from './detection-overlay';
import type { LiveCameraDeps, LiveCameraDevice } from './live-camera-panel';
import type { LiveCameraT } from './live-camera-texts';
import { livePlaylistUrl } from './stream-url';
import { useDetections } from './use-detections';
import { useStreamPlayback } from './use-stream-playback';

export interface WallTileProps {
  readonly device: LiveCameraDevice;
  /** The area the camera watches, under its name. */
  readonly area: string | null;
  /** The camera's page. */
  readonly href: string;
  readonly deps: LiveCameraDeps;
  readonly t: LiveCameraT;
  /** The alert lighting this tile now (a high or critical event this camera saw): its type's label and time. */
  readonly alert: { readonly label: string; readonly at: number } | null;
}

/** A small dark pill over the video. */
function Pill({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * One camera on the live wall, the way a guard's monitor shows it: the picture fills the tile,
 * with the recognised faces drawn over it, a LIVE mark and the number of faces in view at the
 * top, the camera's name and area at the bottom. A tile whose camera just saw a high or critical
 * alert is ringed in red and names the alert. A stream that is starting or down says so in place.
 */
export function WallTile({ device, area, href, deps, t, alert }: WallTileProps): React.ReactElement {
  const Link = useLinkComponent();
  const url = livePlaylistUrl(device.stream_url);
  const playback = useStreamPlayback(url, deps.attach);
  const live = useDetections(device.id, deps);
  const playing = url !== null && playback.state === 'playing';
  const inView = new Set(live.boxes.map((b) => b.detectionId)).size;
  const detectionsDown = live.state.status === 'failed' || live.state.status === 'unavailable';
  return (
    <li
      data-testid="wall-tile"
      data-alert={alert === null ? undefined : 'true'}
      data-alert-at={alert?.at}
      aria-label={t('video', { params: { name: device.name } })}
      className={cn(
        'relative aspect-video overflow-hidden rounded-lg bg-neutral-900 shadow-sm ring-1 ring-black/5 transition-shadow',
        alert !== null && 'ring-[3px] ring-destructive shadow-lg shadow-destructive/25',
      )}
    >
      {url === null ? null : (
        <video
          ref={playback.videoRef}
          muted
          autoPlay
          playsInline
          className={cn('absolute inset-0 size-full object-cover', !playing && 'invisible')}
        />
      )}
      {playing ? <DetectionOverlay boxes={live.boxes} name={device.name} t={t} cover labelShare={1 / 15} /> : null}
      {playing ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
          {url !== null && playback.state === 'loading' ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
          ) : (
            <VideoOff className="size-6" aria-hidden />
          )}
          <span>{url === null ? t('noStream') : playback.state === 'loading' ? t('loading') : t('unavailable')}</span>
        </div>
      )}
      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        {playing ? (
          <Pill>
            <span className="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            {t('live')}
          </Pill>
        ) : (
          <span />
        )}
        {detectionsDown ? (
          <Pill className="text-red-200">{t('detections_failed')}</Pill>
        ) : inView > 0 ? (
          <Pill className="tabular-nums">{t('inView', { params: { count: inView } })}</Pill>
        ) : null}
      </div>
      {alert === null ? null : (
        <div className="absolute inset-x-0 top-9 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-white shadow">
            <Siren className="size-3.5" aria-hidden />
            {alert.label}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-6 pb-2">
        <Link href={href} className="block truncate text-sm font-semibold text-white hover:underline">
          {device.name}
        </Link>
        <p className="truncate text-xs text-white/70">{area ?? t('noArea')}</p>
      </div>
    </li>
  );
}
