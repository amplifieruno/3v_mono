import * as React from 'react';
import type { StreamAttacher } from './hls-player';

/** Where the stream is: starting, showing frames, or down. */
export type PlaybackState = 'loading' | 'playing' | 'unavailable';

/** A stream that shows no frame this long after it was attached counts as unavailable. */
export const STREAM_START_TIMEOUT_MS = 15_000;

/** A playing stream that waits this long for data without playing again counts as unavailable. */
export const STREAM_STALL_MS = 8_000;

/** An unavailable stream is tried again after this long (a camera back online reappears). */
export const STREAM_RETRY_MS = 20_000;

export interface StreamPlaybackResult {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly state: PlaybackState;
  readonly retry: () => void;
}

/**
 * Plays the HLS playlist at `url` in the returned video element: `playing` once the element
 * plays frames, `unavailable` when the player gives up, no frame arrives in time, or playback stalls
 * for {@link STREAM_STALL_MS} without progress (a `timeupdate` clears a pending stall). An
 * unavailable stream is retried on `retry()` and on its own after a while.
 */
export function useStreamPlayback(url: string | null, attach: StreamAttacher): StreamPlaybackResult {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [state, setState] = React.useState<PlaybackState>('loading');
  const [round, setRound] = React.useState(0);
  const retry = React.useCallback(() => setRound((value) => value + 1), []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!url || !video) return undefined;
    let active = true;
    let started = false;
    let destroy: (() => void) | undefined;
    setState('loading');
    const unavailable = (): void => {
      if (active) setState('unavailable');
    };
    let stall: ReturnType<typeof setTimeout> | undefined;
    const playing = (): void => {
      started = true;
      clearTimeout(stall);
      stall = undefined;
      if (active) setState('playing');
    };
    // A stream that stops delivering (`waiting`, `stalled`) and does not recover in time is down.
    const waiting = (): void => {
      if (!started || stall !== undefined) return;
      stall = setTimeout(unavailable, STREAM_STALL_MS);
    };
    // Progress (`timeupdate`) clears it: a healthy HLS stream may report `stalled` (the network
    // fetch paused) while it keeps playing from its buffer, and fires no `playing` afterwards.
    const progressed = (): void => {
      clearTimeout(stall);
      stall = undefined;
    };
    video.addEventListener('playing', playing);
    video.addEventListener('timeupdate', progressed);
    video.addEventListener('waiting', waiting);
    video.addEventListener('stalled', waiting);
    const timeout = setTimeout(() => {
      if (!started) unavailable();
    }, STREAM_START_TIMEOUT_MS);
    attach(video, url, { onUnavailable: unavailable }).then(
      (playback) => {
        if (active) destroy = () => playback.destroy();
        else playback.destroy();
      },
      unavailable,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
      clearTimeout(stall);
      video.removeEventListener('playing', playing);
      video.removeEventListener('timeupdate', progressed);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('stalled', waiting);
      destroy?.();
    };
  }, [url, attach, round]);

  React.useEffect(() => {
    if (state !== 'unavailable') return undefined;
    const timer = setTimeout(retry, STREAM_RETRY_MS);
    return () => clearTimeout(timer);
  }, [state, retry]);

  return { videoRef, state, retry };
}
