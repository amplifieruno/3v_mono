# Spec 05: Cleanup and Verification

## Goal

Remove old MediaMTX artifacts, update references, verify the full pipeline works end-to-end.

## Cleanup

### Delete `docker/mediamtx/`

After migration is complete:
- `docker/mediamtx/Dockerfile`
- `docker/mediamtx/mediamtx.yml`
- `docker/mediamtx/download-samples.sh`

Videos (`docker/mediamtx/videos/*.mp4`) should already be moved to `docker/stream-server/videos/`.

### Update `download-samples.sh`

Copy to `docker/stream-server/download-samples.sh`, update:
- `VIDEO_DIR` path to `$SCRIPT_DIR/videos`
- `CONTAINER_NAME` to `itap-stream-server-prod` or `3v_stream_server`
- Remove `--deploy` docker cp logic (videos are baked in at build time, need rebuild instead)

### Update Makefile (if needed)

Check if any Makefile targets reference `mediamtx`. Update container names if so.

### Update `.env.dev`

Remove any `VITE_MEDIAMTX_*` vars. Add if needed:
```
VITE_STREAM_BASE=http://localhost:8888
```

### Backend Dockerfile

Check if `apps/backend/Dockerfile` still needs `ffmpeg` in the production stage. Since recognition no longer uses ffmpeg, it may be removable — but check if any other backend feature uses it (face-api.js model loading, image processing, etc.). If ffmpeg is only used for RTSP frame capture, remove it from the production stage to shrink the image.

## Verification Plan

### 1. Build stream-server container
```bash
cd docker/stream-server
docker build -t stream-server-test .
```
Verify: build succeeds, no ffmpeg errors during segmentation.

### 2. Run and test endpoints
```bash
docker run -p 8888:8888 stream-server-test
```
Test:
- `curl http://localhost:8888/health` → 200 "ok"
- `curl http://localhost:8888/streams/entrance/live.m3u8` → valid m3u8 playlist
- `curl http://localhost:8888/streams/entrance/snapshot.jpg -o test.jpg` → valid JPEG
- `curl http://localhost:8888/streams/lobby/live.m3u8` → valid m3u8 for different stream
- `curl http://localhost:8888/streams/nonexistent/live.m3u8` → 404

### 3. Verify HLS synchronization
```bash
# Two requests 1 second apart should return playlists with shifted segments
curl http://localhost:8888/streams/entrance/live.m3u8
sleep 1
curl http://localhost:8888/streams/entrance/live.m3u8
# EXT-X-MEDIA-SEQUENCE should increment, segment numbers should shift
```

### 4. Verify snapshot synchronization
```bash
# Two requests at the same second should return similar frame numbers
curl http://localhost:8888/streams/entrance/snapshot.jpg -o snap1.jpg
curl http://localhost:8888/streams/entrance/snapshot.jpg -o snap2.jpg
# Should be identical or adjacent frames
```

### 5. Full stack dev test
```bash
make dev-compose
pnpm run dev
```
- Navigate to device page in browser
- Verify HLS video plays as "live" stream
- Enable recognition, verify detections appear
- Check backend logs for snapshot fetch success

### 6. Playwright visual verification
- Navigate to a device page
- Take screenshot to verify video stream renders
- Enable recognition toggle
- Wait for detections to appear in LiveDetections panel
- Take screenshot to verify detections visible

## Resource Verification

After running for 1 minute:
```bash
docker stats stream-server
```
Expected: CPU ~0%, Memory ~10-20MB (vs MediaMTX: CPU 100%, Memory 200-500MB)

## Files

| Action | Path |
|--------|------|
| Delete | `docker/mediamtx/Dockerfile` |
| Delete | `docker/mediamtx/mediamtx.yml` |
| Delete | `docker/mediamtx/download-samples.sh` |
| Move   | `docker/mediamtx/videos/*.mp4` → `docker/stream-server/videos/` |
| Create | `docker/stream-server/download-samples.sh` |
| Modify | `.env.dev` (if VITE_MEDIAMTX vars exist) |
| Check  | `apps/backend/Dockerfile` — possibly remove ffmpeg |
| Check  | `Makefile` — update any mediamtx references |
