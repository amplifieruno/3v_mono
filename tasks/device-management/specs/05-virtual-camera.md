# Spec 05: Virtual Camera Infrastructure

## Objective

Set up MediaMTX Docker container that loops sample video files as virtual RTSP cameras, providing WebRTC output for browser playback.

## Files to Create/Modify

### Create

- `docker/mediamtx/mediamtx.yml` — MediaMTX configuration
- `docker/mediamtx/videos/` — Directory for sample video files (with `.gitkeep` or a README)

### Modify

- `docker/docker-compose.dev.yml` (or equivalent dev compose file) — Add MediaMTX service
- `Makefile` — Add convenience targets if needed

## Implementation Details

### 1. MediaMTX Docker Service

```yaml
# In docker-compose
mediamtx:
  image: bluenviron/mediamtx:latest
  container_name: mediamtx
  ports:
    - "8554:8554"   # RTSP
    - "8889:8889"   # WebRTC (HTTP)
    - "8189:8189/udp" # WebRTC (ICE/UDP)
  volumes:
    - ./docker/mediamtx/mediamtx.yml:/mediamtx.yml
    - ./docker/mediamtx/videos:/videos
  restart: unless-stopped
```

Note: Using explicit port mapping instead of `network_mode: host` for Docker Compose compatibility. If WebRTC has issues with NAT, we can switch to host networking.

### 2. MediaMTX Configuration

```yaml
# docker/mediamtx/mediamtx.yml

# WebRTC settings
webrtc: yes
webrtcAddress: :8889

# RTSP settings
rtsp: yes
rtspAddress: :8554

# Stream paths — virtual cameras looping video files
paths:
  entrance-cam:
    runOnInit: >
      ffmpeg -re -stream_loop -1 -i /videos/entrance.mp4
      -c copy -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH
    runOnInitRestart: yes

  lobby-cam:
    runOnInit: >
      ffmpeg -re -stream_loop -1 -i /videos/lobby.mp4
      -c copy -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH
    runOnInitRestart: yes

  parking-cam:
    runOnInit: >
      ffmpeg -re -stream_loop -1 -i /videos/parking.mp4
      -c copy -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH
    runOnInitRestart: yes
```

### 3. Sample Videos

We need 2-3 short surveillance-style videos (10-60 seconds each) in H.264 MP4 format. Options:

**Option A (recommended)**: Download free surveillance footage from public datasets:
- VIRAT dataset clips
- MOT challenge clips
- Any short MP4 with people walking

**Option B**: Create a script to download sample videos:
```bash
# docker/mediamtx/download-samples.sh
#!/bin/bash
# Downloads sample surveillance videos for virtual cameras
# Run this once to populate the videos directory
```

**Option C**: Add a README in the videos directory explaining how to add videos:
```
# docker/mediamtx/videos/README.md
Place MP4 files here for virtual camera streams.
Files should be H.264 encoded for best compatibility.
```

For the initial setup, provide a script or clear instructions. Do NOT commit large video files to git — use `.gitignore` for `*.mp4` in this directory.

### 4. Accessing Streams

Once running:
- **RTSP**: `rtsp://localhost:8554/entrance-cam`
- **WebRTC player**: `http://localhost:8889/entrance-cam` (built-in MediaMTX web page)
- **Embeddable**: `<iframe src="http://localhost:8889/entrance-cam">`

### 5. Docker Compose Integration

The MediaMTX service should:
- Start with `make dev-compose`
- Be optional (gracefully degrade if no videos are present)
- Not block other services from starting

### 6. CORS / Proxy Considerations

If the admin-ui runs on a different port (e.g., 5173), the WebRTC iframe from port 8889 should work fine (iframes don't have CORS restrictions for rendering). However, if we use the MediaMTX JS API directly, we may need to:
- Configure MediaMTX CORS headers, OR
- Proxy through Vite dev server, OR
- Proxy through Traefik

The simplest approach for demo is iframe embedding.

## Acceptance Criteria

- [ ] MediaMTX container starts and serves RTSP + WebRTC
- [ ] At least one virtual camera stream loops a video file
- [ ] Stream is viewable at `http://localhost:8889/<stream-name>` in browser
- [ ] Stream is accessible via RTSP at `rtsp://localhost:8554/<stream-name>`
- [ ] Docker Compose integration works with `make dev-compose`
- [ ] Video files are gitignored, with instructions for adding them
