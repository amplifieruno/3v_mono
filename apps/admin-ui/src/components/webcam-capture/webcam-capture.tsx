import { useT } from '@burojs/react';
import { Button, cn } from '@burojs/ui-shadcn';
import { Camera, CameraOff, Aperture } from 'lucide-react';
import * as React from 'react';
import { useWebcam, type WebcamStatus } from './use-webcam';

export interface WebcamCaptureProps {
  /** Receives each captured frame as a JPEG file (`capture-<time>.jpg`). */
  readonly onCapture: (file: File) => void | Promise<void>;
  /** Locks the buttons, for example while the previous frame uploads or the form is read-only. */
  readonly disabled?: boolean;
  /** No more photos are wanted (the limit is reached): the camera stops and cannot be started. */
  readonly done?: boolean;
}

/** The bundle key of what the area says for a camera status, if anything. */
const STATUS_TEXT: Partial<Record<WebcamStatus, string>> = {
  starting: 'console.webcam.starting',
  denied: 'console.webcam.denied',
  missing: 'console.webcam.missing',
  busy: 'console.webcam.busy',
  unsupported: 'console.webcam.unsupported',
  failed: 'console.webcam.failed',
};

const PROBLEMS: ReadonlySet<WebcamStatus> = new Set(['denied', 'missing', 'busy', 'unsupported', 'failed']);

/**
 * Takes photos with the browser camera (`itap:webcam-capture`, design §10 call 2): "Use camera"
 * asks for the camera, the live picture is shown mirrored like a mirror, and "Take photo" hands
 * the current frame to `onCapture` as a JPEG file. A refused permission, a missing or busy
 * camera and a browser without camera access each say so; the camera stops on "Stop camera",
 * once `done` (no more photos wanted) and when the component goes away. No analysis happens here: face quality is checked by the
 * platform when the photos are submitted.
 */
export function WebcamCapture({ onCapture, disabled = false, done = false }: WebcamCaptureProps): React.ReactElement {
  const t = useT();
  const { status, videoRef, start, stop, capture } = useWebcam();
  const [taking, setTaking] = React.useState(false);
  const live = status === 'live';
  const statusKey = STATUS_TEXT[status];

  // The last wanted photo is taken: the camera light goes off rather than waiting for the dialog.
  React.useEffect(() => {
    if (done && live) stop();
  }, [done, live, stop]);

  const take = async (): Promise<void> => {
    setTaking(true);
    try {
      const blob = await capture();
      if (blob !== null) {
        await onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      }
    } finally {
      setTaking(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="webcam-capture">
      {/* Always mounted: the stream is attached to it as soon as the browser grants the camera. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={t('console.webcam.preview')}
        className={cn('aspect-video w-full max-w-sm -scale-x-100 rounded-md border bg-black object-cover', !live && 'hidden')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <>
            <Button type="button" size="sm" disabled={disabled || taking} onClick={() => void take()}>
              <Aperture className="size-4" aria-hidden />
              {t('console.webcam.take')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={stop}>
              <CameraOff className="size-4" aria-hidden />
              {t('console.webcam.stop')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || done || status === 'starting'}
            onClick={() => void start()}
          >
            <Camera className="size-4" aria-hidden />
            {t('console.webcam.start')}
          </Button>
        )}
      </div>
      {statusKey === undefined ? null : (
        <p
          role={PROBLEMS.has(status) ? 'alert' : 'status'}
          className={cn('text-sm', PROBLEMS.has(status) ? 'text-destructive' : 'text-muted-foreground')}
        >
          {t(statusKey)}
        </p>
      )}
    </div>
  );
}
