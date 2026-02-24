# Lightweight Stream Server — Summary

## What Was Done

Replaced MediaMTX (heavy RTSP/HLS server with 4 ffmpeg processes) with a lightweight OpenResty-based stream server that pre-segments videos at build time and serves them as fake live HLS streams at runtime.

## Changes Made

### New Files (`docker/stream-server/`)
- **Dockerfile** — Multi-stage: alpine+ffmpeg prepares videos, openresty serves
- **prepare-videos.sh** — Segments mp4s into 1s HLS .ts chunks + 24fps JPEG frames
- **nginx.conf** — OpenResty config with unified Lua routing, CORS support
- **lua/meta.lua** — Loads and caches per-stream metadata
- **lua/playlist.lua** — Generates live HLS playlists using wall-clock time modulo
- **lua/snapshot.lua** — Serves synchronized JPEG snapshot for current frame
- **download-samples.sh** — Adapted from mediamtx version

### Modified Files
- **docker/docker-compose.dev.yml** — Replaced mediamtx service with stream-server
- **docker/docker-compose.prod.yml** — Replaced mediamtx service + Traefik labels + STREAM_SERVER_URL env
- **StreamPreview.tsx** — URL pattern: `/{path}/index.m3u8` → `/streams/{path}/live.m3u8`, env var renamed
- **recognitionManager.ts** — Rewrote from ffmpeg/RTSP to HTTP snapshot polling (removed ~100 lines of buffer management)

### Deleted Files
- `docker/mediamtx/` — Entire directory (Dockerfile, mediamtx.yml, download-samples.sh)

## Key Decisions

1. **Re-encode with libx264** during build instead of `-c copy` to ensure exact 1-second segment boundaries (keyframe-aligned)
2. **Unified Lua content handler** in nginx instead of separate location blocks — needed for proper CORS preflight handling
3. **Wildcard `Access-Control-Allow-Headers: *`** — browsers add `traceparent` (OpenTelemetry) headers that need to be allowed
4. **Direct file I/O in snapshot.lua** instead of `ngx.exec` redirect — avoids nginx alias regex issues with internal redirects
5. **`isProcessing` guard** in recognition to prevent overlapping frame processing when InsightFace is slow

## Resource Comparison

| Metric | MediaMTX (Before) | Stream Server (After) |
|--------|-------------------|----------------------|
| CPU | ~100% (4 ffmpeg) | ~0.05% |
| Memory | 200-500 MB | ~11 MB |
| Disk I/O | 2 GBps, 40K IOPS | Near zero |
| Runtime processes | 4 ffmpeg + mediamtx | 1 nginx |

## Test Results

- **HLS playback**: Video renders in browser, `live=true`, fragments load continuously
- **Cross-origin**: CORS works from `localhost:5173` to `localhost:8888`
- **Synchronization**: Playlists shift correctly, snapshots at same second are identical
- **Face recognition**: 26 frames processed, 2 faces detected, 1 identity created, 0 errors
- **All 4 streams**: entrance, lobby, serverroom, warehouse serve correctly
- **404 handling**: Nonexistent streams return proper 404
