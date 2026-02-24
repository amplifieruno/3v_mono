# Spec 03: Frontend — Update HLS URL Pattern

## Goal

Update `StreamPreview.tsx` to use the new stream server URL pattern. The component should NOT know the stream is fake — it just points to a different HLS URL format.

## Current Behavior

`StreamPreview.tsx:12-24` — `getHlsUrl()`:
- Takes RTSP URL like `rtsp://mediamtx:8554/entrance`
- Extracts stream path (`entrance`)
- Builds HLS URL: `https://stream.{domain}/entrance/index.m3u8`
- Uses env var `VITE_MEDIAMTX_HLS_BASE` as override

## New Behavior

The URL pattern changes:
- **Before**: `https://stream.{domain}/entrance/index.m3u8`
- **After**: `https://stream.{domain}/streams/entrance/live.m3u8`

The `getHlsUrl()` function still:
1. Extracts stream path from device's `stream_url`
2. Builds HLS URL using base + path

### Updated `getHlsUrl()`

```typescript
const getHlsUrl = (rtspUrl: string): string => {
  const base =
    import.meta.env.VITE_STREAM_BASE ||
    `${window.location.protocol}//stream.${window.location.hostname.replace(/^app\./, '')}`;
  try {
    const url = new URL(rtspUrl);
    const streamPath = url.pathname.replace(/^\//, '');
    return `${base}/streams/${streamPath}/live.m3u8`;
  } catch {
    const match = rtspUrl.match(/\/([^/]+)$/);
    const streamPath = match?.[1] ?? rtspUrl;
    return `${base}/streams/${streamPath}/live.m3u8`;
  }
};
```

Changes:
1. Env var renamed: `VITE_MEDIAMTX_HLS_BASE` → `VITE_STREAM_BASE`
2. URL path changed: `/{path}/index.m3u8` → `/streams/{path}/live.m3u8`

### hls.js config — no changes needed

The existing hls.js config already works for live streams:
- `lowLatencyMode: false` — correct
- `liveSyncDurationCount: 3` — matches our 3-segment window
- Error recovery — already handles network/media errors

## Device `stream_url` in Database

The `stream_url` field in `itap.devices` currently stores `rtsp://mediamtx:8554/entrance`. This value is used by:
1. **Frontend**: `getHlsUrl()` extracts path from it
2. **Backend**: Uses it to connect to RTSP (will change in spec 04)

We keep `stream_url` as-is in the database. The frontend extracts the path (`entrance`) from it — this works regardless of whether it's RTSP or not. The backend will change how it uses this field.

## Files

| Action | Path |
|--------|------|
| Modify | `apps/admin-ui/src/resources/device/components/StreamPreview.tsx` — update `getHlsUrl()` |
