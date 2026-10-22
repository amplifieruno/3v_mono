/** Where the stream-server is proxied on the console's own origin (vite in dev, nginx in prod). */
export const STREAMS_BASE = '/streams';

/**
 * The stream-server's stream id of a camera: the last path segment of its `stream_url`
 * (`rtsp://mediamtx:8554/entrance` → `entrance`), read exactly as the backend reads it
 * (`streamIdOf` in `apps/backend/src/events/deviceHealthCheck.ts`). `null` without one.
 */
export function streamIdOf(streamUrl: string | null | undefined): string | null {
  if (!streamUrl) return null;
  try {
    const segments = new URL(streamUrl).pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

/** The camera's HLS playlist on the stream-server, or `null` without a stream id. */
export function livePlaylistUrl(streamUrl: string | null | undefined): string | null {
  const id = streamIdOf(streamUrl);
  return id === null ? null : `${STREAMS_BASE}/${encodeURIComponent(id)}/live.m3u8`;
}
