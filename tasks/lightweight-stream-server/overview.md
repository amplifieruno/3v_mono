# Lightweight Stream Server

## Goal

Replace MediaMTX (heavy RTSP/HLS server with 4+ ffmpeg processes, 100% CPU) with a lightweight OpenResty-based stream server that serves pre-segmented HLS and synchronized snapshots. Frontend and backend must NOT know the stream is fake — they interact with it as if it were a real camera system.

## Problem

MediaMTX runs 4 ffmpeg processes continuously (one per video), each looping video via RTSP and remuxing to HLS. This causes:
- 100% CPU usage
- 2 GBps disk read
- 40K IOPS
- Cascading resource exhaustion

## Solution

**Pre-segmented HLS + OpenResty Lua** — a "fake camera server" that:

1. **Build-time**: ffmpeg segments videos into 1-second `.ts` chunks and extracts frames at 24fps as JPEG
2. **Runtime**: OpenResty serves dynamic `.m3u8` playlists via Lua that simulate a live stream using `position = (timestamp % duration)`
3. **Snapshot endpoint**: `/streams/:id/snapshot.jpg` returns the current synchronized frame — backend uses this instead of RTSP+ffmpeg
4. **Zero runtime ffmpeg** — all processing happens at build time

## Key Principles

- **Frontend doesn't know it's fake**: hls.js sees a standard live HLS stream (no `#EXT-X-ENDLIST`, monotonically increasing `EXT-X-MEDIA-SEQUENCE`)
- **Backend doesn't know it's fake**: it calls `GET /streams/:id/snapshot.jpg` — same as a real IP camera snapshot endpoint
- **All viewers synchronized**: everyone sees the same moment via deterministic `timestamp % duration` calculation
- **Backend recognition synchronized**: snapshot returns the same frame that viewers see at that moment

## Architecture

```
Build-time (once):
  ffmpeg → .ts segments (1s each) + .jpg frames (24fps)
  └── stored in /videos/<stream_id>/segments/ and /videos/<stream_id>/frames/

Runtime (~0% CPU):
  OpenResty (nginx + Lua)
  ├── GET /streams/<id>/live.m3u8     → Lua generates live playlist
  ├── GET /streams/<id>/snapshot.jpg  → Lua serves current frame
  └── GET /streams/<id>/segments/     → static .ts files

Frontend (unchanged):
  hls.js → /streams/<id>/live.m3u8 → plays as live stream

Backend (minimal change):
  recognition → GET /streams/<id>/snapshot.jpg → InsightFace
  (replaces: ffmpeg → RTSP → frame extraction)
```

## Video Parameters

- **Segment duration**: 1 second
- **Frame extraction**: 24 fps (24 frames per second of video)
- **Videos**: entrance.mp4, lobby.mp4, serverroom.mp4, warehouse.mp4
- **Metadata**: `meta.json` per stream with duration, segment count, fps, total frames

## Files Affected

### New / Replaced
- `docker/stream-server/Dockerfile` — OpenResty + build-time segmentation
- `docker/stream-server/nginx.conf` — OpenResty config with Lua
- `docker/stream-server/lua/playlist.lua` — dynamic m3u8 generation
- `docker/stream-server/lua/snapshot.lua` — synchronized frame serving
- `docker/stream-server/lua/meta.lua` — metadata loading/caching
- `docker/stream-server/prepare-videos.sh` — build-time segmentation script

### Modified
- `docker/docker-compose.dev.yml` — replace mediamtx with stream-server
- `docker/docker-compose.prod.yml` — replace mediamtx with stream-server
- `apps/admin-ui/src/resources/device/components/StreamPreview.tsx` — update HLS URL pattern
- `apps/backend/src/services/recognitionManager.ts` — use snapshot endpoint instead of RTSP+ffmpeg
- `apps/nhost/nhost/migrations/.../seed_devices` — update stream_url format

### Removed
- `docker/mediamtx/` — entire directory (Dockerfile, mediamtx.yml, download-samples.sh)
  - Videos (`.mp4` files) move to `docker/stream-server/videos/`

## Out of Scope

- Changing InsightFace integration
- Changing identity matching logic
- Changing Socket.io events
- Changing UI components beyond URL updates
