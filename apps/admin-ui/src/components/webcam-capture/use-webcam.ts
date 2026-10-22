import * as React from 'react';

/**
 * Where the camera is: `off` until asked, `starting` while the browser asks for permission,
 * `live` with a picture, or why there is none: the permission was refused (`denied`), the
 * device has no camera (`missing`), another application holds it (`busy`), the browser offers
 * no camera access at all, as on a page not served over HTTPS (`unsupported`), or anything else
 * (`failed`).
 */
export type WebcamStatus = 'off' | 'starting' | 'live' | 'denied' | 'missing' | 'busy' | 'unsupported' | 'failed';

/** The status a refused `getUserMedia` call means, from the DOMException name the browser gives. */
export function webcamFailure(error: unknown): WebcamStatus {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'missing';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'failed';
}

/** JPEG quality of a captured frame: sharp enough for face quality checks, a few hundred kB. */
export const CAPTURE_JPEG_QUALITY = 0.92;

/** The video constraints asked for: the front camera at up to 1280×720. */
const VIDEO: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** The current frame of `video` as a JPEG blob, or `null` before the first frame. */
export function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return Promise.resolve(null);
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', CAPTURE_JPEG_QUALITY));
}

export interface Webcam {
  readonly status: WebcamStatus;
  /** Attach to the `<video>` that shows the picture. */
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  /** The current frame as a JPEG blob; `null` when the camera is not live. */
  readonly capture: () => Promise<Blob | null>;
}

/**
 * The browser camera (`getUserMedia`), started on demand. Every track is stopped on `stop`, on
 * unmount and when a start resolves after the component left, so the camera light never stays
 * on behind a closed dialog.
 */
export function useWebcam(): Webcam {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const mounted = React.useRef(true);
  const [status, setStatus] = React.useState<WebcamStatus>('off');

  const stop = React.useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mounted.current) setStatus('off');
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const start = React.useCallback(async () => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media?.getUserMedia === undefined) {
      setStatus('unsupported');
      return;
    }
    setStatus('starting');
    try {
      const stream = await media.getUserMedia({ video: VIDEO, audio: false });
      if (!mounted.current) {
        stopStream(stream);
        return;
      }
      stopStream(streamRef.current);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (error: unknown) {
      if (mounted.current) setStatus(webcamFailure(error));
    }
  }, []);

  const capture = React.useCallback(async () => {
    const video = videoRef.current;
    if (video === null || streamRef.current === null) return null;
    return captureFrame(video);
  }, []);

  return { status, videoRef, start, stop, capture };
}
