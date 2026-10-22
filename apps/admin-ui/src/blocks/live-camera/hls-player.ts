/** What a playback reports to the live view. */
export interface StreamEvents {
  /** The stream cannot be played: the playlist or a segment failed for good, or no player fits. */
  readonly onUnavailable: () => void;
}

/** A started playback; `destroy` detaches it from the video element. */
export interface StreamPlayback {
  destroy(): void;
}

/** Plays `url` (an HLS playlist) in `video`. */
export type StreamAttacher = (
  video: HTMLVideoElement,
  url: string,
  events: StreamEvents,
) => Promise<StreamPlayback>;

const HLS_MIME = 'application/vnd.apple.mpegurl';

/**
 * The live view's player: hls.js where Media Source Extensions exist (loaded on demand, out of
 * the initial bundle), the browser's own HLS playback otherwise (Safari on iOS). A fatal hls.js
 * error, a media error or no player at all reports the stream unavailable.
 */
export const attachHlsStream: StreamAttacher = async (video, url, events) => {
  const { default: Hls } = await import('hls.js');
  if (Hls.isSupported()) {
    const hls = new Hls({ liveDurationInfinity: true, backBufferLength: 10 });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) events.onUnavailable();
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => undefined);
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    return { destroy: () => hls.destroy() };
  }
  if (video.canPlayType(HLS_MIME)) {
    const onError = (): void => events.onUnavailable();
    video.addEventListener('error', onError);
    video.src = url;
    void video.play().catch(() => undefined);
    return {
      destroy: () => {
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
      },
    };
  }
  events.onUnavailable();
  return { destroy: () => undefined };
};
