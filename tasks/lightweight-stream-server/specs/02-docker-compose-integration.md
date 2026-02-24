# Spec 02: Docker Compose Integration

## Goal

Replace `mediamtx` service with `stream-server` in both dev and prod compose files. Update Traefik routing, ports, volumes.

## Dev Compose Changes

### `docker/docker-compose.dev.yml`

Replace the `mediamtx` service block:

```yaml
# BEFORE (remove):
mediamtx:
  build:
    context: ./mediamtx
    dockerfile: Dockerfile
  container_name: 3v_mediamtx
  ports:
    - "8554:8554"
    - "8888:8888"
    - "8189:8189/udp"
  volumes:
    - type: bind
      source: ./mediamtx/mediamtx.yml
      target: /mediamtx.yml
      read_only: true
    - type: bind
      source: ./mediamtx/videos
      target: /videos
      read_only: true
  cpus: 1.0
  mem_limit: 512m
  restart: unless-stopped

# AFTER (add):
stream-server:
  build:
    context: ./stream-server
    dockerfile: Dockerfile
  container_name: 3v_stream_server
  ports:
    - "8888:8888"
  restart: unless-stopped
```

Key differences:
- No RTSP port (8554) — not needed
- No WebRTC port (8189) — not needed
- No bind-mount volumes — videos are baked into image at build time
- No resource limits needed — nginx uses ~5MB RAM, ~0% CPU
- No `mediamtx.yml` config — replaced by `nginx.conf` inside image

### Dev note on video iteration

During development, if videos change frequently, add a bind mount override:
```yaml
# Optional: uncomment for video development
# volumes:
#   - type: bind
#     source: ./stream-server/videos
#     target: /input
#     read_only: true
```

But normally videos are baked in at `docker build` time.

## Prod Compose Changes

### `docker/docker-compose.prod.yml`

Replace the `mediamtx` service block:

```yaml
# BEFORE (remove):
mediamtx:
  build:
    context: ./mediamtx
    dockerfile: Dockerfile
  container_name: itap-mediamtx-prod
  ports:
    - "8554:8554"
    - "8189:8189/udp"
  volumes:
    - type: bind
      source: ./mediamtx/mediamtx.yml
      target: /mediamtx.yml
      read_only: true
    - type: bind
      source: ./mediamtx/videos
      target: /videos
      read_only: true
  networks:
    - internal
    - proxy
  labels:
    traefik.enable: "true"
    traefik.http.routers.mediamtx.entrypoints: web
    traefik.http.routers.mediamtx.rule: Host(`${STREAM_URL}`)
    traefik.http.services.mediamtx.loadbalancer.server.port: "8888"
  cpus: 1.0
  mem_limit: 512m
  restart: unless-stopped

# AFTER (add):
stream-server:
  build:
    context: ./stream-server
    dockerfile: Dockerfile
  container_name: itap-stream-server-prod
  networks:
    - internal
    - proxy
  labels:
    traefik.enable: "true"
    traefik.http.routers.stream-server.entrypoints: web
    traefik.http.routers.stream-server.rule: Host(`${STREAM_URL}`)
    traefik.http.services.stream-server.loadbalancer.server.port: "8888"
  restart: unless-stopped
```

Key differences:
- Traefik router name changes from `mediamtx` to `stream-server`
- No resource limits needed
- No direct port exposure (Traefik handles routing)
- No volumes — everything baked in

## Backend Service — Update `depends_on`

In both compose files, if backend has `depends_on: mediamtx`, change to `stream-server`. Currently the backend doesn't depend on mediamtx directly (it connects via `RTSP_HOST` env var), so this may not be needed.

## Backend Environment — Remove RTSP_HOST

The backend will no longer connect via RTSP. Instead it will use HTTP to fetch snapshots. The `RTSP_HOST` env var is no longer needed.

In `docker/docker-compose.prod.yml`, replace:
```yaml
RTSP_HOST: mediamtx
```
with:
```yaml
STREAM_SERVER_URL: http://stream-server:8888
```

In `docker/docker-compose.dev.yml` (if backend env vars exist), same change:
```yaml
STREAM_SERVER_URL: http://stream-server:8888
```

For local dev (outside Docker), the env var can be:
```
STREAM_SERVER_URL=http://localhost:8888
```

## Files

| Action | Path |
|--------|------|
| Modify | `docker/docker-compose.dev.yml` — replace mediamtx → stream-server |
| Modify | `docker/docker-compose.prod.yml` — replace mediamtx → stream-server |
