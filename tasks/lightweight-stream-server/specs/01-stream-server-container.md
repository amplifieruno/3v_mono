# Spec 01: Stream Server Container (OpenResty + Build-time Segmentation)

## Goal

Replace `docker/mediamtx/` with `docker/stream-server/` — an OpenResty-based container that pre-segments videos at build time and serves them as fake live HLS streams + synchronized snapshots at runtime.

## Build-time: Video Preparation Script

### `docker/stream-server/prepare-videos.sh`

Runs during `docker build`. For each `.mp4` in `/input/`:

```bash
#!/bin/bash
set -e

INPUT_DIR="/input"
OUTPUT_DIR="/videos"

for video in "$INPUT_DIR"/*.mp4; do
  name=$(basename "$video" .mp4)
  mkdir -p "$OUTPUT_DIR/$name/segments" "$OUTPUT_DIR/$name/frames"

  # Get duration in seconds (float)
  duration=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$video")

  # Get fps from source
  src_fps=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=r_frame_rate \
    -of default=noprint_wrappers=1:nokey=1 "$video")

  # HLS segments: 1-second .ts files
  ffmpeg -i "$video" -c copy -f hls \
    -hls_time 1 \
    -hls_list_size 0 \
    -hls_segment_filename "$OUTPUT_DIR/$name/segments/seg%04d.ts" \
    "$OUTPUT_DIR/$name/segments/playlist.m3u8"

  total_segments=$(ls "$OUTPUT_DIR/$name/segments"/seg*.ts | wc -l)

  # Frames: 24 fps JPEGs
  ffmpeg -i "$video" -vf fps=24 -q:v 3 \
    "$OUTPUT_DIR/$name/frames/frame_%05d.jpg"

  total_frames=$(ls "$OUTPUT_DIR/$name/frames"/frame_*.jpg | wc -l)

  # Write meta.json
  cat > "$OUTPUT_DIR/$name/meta.json" <<EOF
{
  "duration": $duration,
  "segment_duration": 1,
  "total_segments": $total_segments,
  "fps": 24,
  "total_frames": $total_frames,
  "source_fps": "$src_fps"
}
EOF

  echo "Prepared $name: ${duration}s, $total_segments segments, $total_frames frames"
done
```

### Output structure per video:
```
/videos/entrance/
├── meta.json
├── segments/
│   ├── seg0000.ts
│   ├── seg0001.ts
│   └── ...
└── frames/
    ├── frame_00001.jpg
    ├── frame_00002.jpg
    └── ...
```

## Dockerfile

### `docker/stream-server/Dockerfile`

```dockerfile
# Stage 1: Segment videos
FROM alpine:3.21 AS prepare
RUN apk add --no-cache ffmpeg bash jq
COPY videos/ /input/
COPY prepare-videos.sh /prepare-videos.sh
RUN chmod +x /prepare-videos.sh && /prepare-videos.sh

# Stage 2: Runtime — OpenResty serves static + Lua
FROM openresty/openresty:alpine

# Copy prepared videos
COPY --from=prepare /videos /videos

# Copy nginx config and Lua scripts
COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY lua/ /usr/local/openresty/nginx/lua/

EXPOSE 8888

CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
```

## Runtime: Lua Scripts

### `docker/stream-server/lua/meta.lua` — Metadata loader with caching

```lua
local cjson = require("cjson")
local _M = {}
local cache = {}

function _M.load(stream_id)
  if cache[stream_id] then
    return cache[stream_id]
  end

  local path = "/videos/" .. stream_id .. "/meta.json"
  local f = io.open(path, "r")
  if not f then
    return nil
  end

  local content = f:read("*a")
  f:close()

  local meta = cjson.decode(content)
  cache[stream_id] = meta
  return meta
end

return _M
```

### `docker/stream-server/lua/playlist.lua` — Dynamic m3u8 generation

```lua
local meta_loader = require("meta")

local stream_id = ngx.var.stream_id
local meta = meta_loader.load(stream_id)

if not meta then
  ngx.status = 404
  ngx.say("Stream not found: " .. stream_id)
  return
end

local seg_dur = meta.segment_duration
local total_segs = meta.total_segments
local duration = meta.duration

local now = ngx.now()
local pos = now % duration
local current_seg = math.floor(pos / seg_dur)

-- Media sequence monotonically increases (wall clock based)
-- This makes hls.js think it's a never-ending live stream
local media_seq = math.floor(now / seg_dur)

-- Sliding window of 3 segments (standard for live HLS)
local window = 3

ngx.header["Content-Type"] = "application/vnd.apple.mpegurl"
ngx.header["Cache-Control"] = "no-cache, no-store"

local body = "#EXTM3U\n"
body = body .. "#EXT-X-VERSION:3\n"
body = body .. "#EXT-X-TARGETDURATION:" .. seg_dur .. "\n"
body = body .. "#EXT-X-MEDIA-SEQUENCE:" .. media_seq .. "\n"

for i = 0, window - 1 do
  local seg = (current_seg + i) % total_segs
  body = body .. "#EXTINF:" .. seg_dur .. ".000,\n"
  body = body .. string.format("/streams/%s/segments/seg%04d.ts", stream_id, seg) .. "\n"
end

-- NO #EXT-X-ENDLIST — signals live stream to hls.js
ngx.print(body)
```

### `docker/stream-server/lua/snapshot.lua` — Synchronized frame serving

```lua
local meta_loader = require("meta")

local stream_id = ngx.var.stream_id
local meta = meta_loader.load(stream_id)

if not meta then
  ngx.status = 404
  ngx.say("Stream not found: " .. stream_id)
  return
end

local fps = meta.fps
local duration = meta.duration
local total_frames = meta.total_frames

local now = ngx.now()
local pos = now % duration
-- +1 because frames are 1-indexed (frame_00001.jpg)
local frame_idx = (math.floor(pos * fps) % total_frames) + 1

ngx.exec(string.format("/streams/%s/frames/frame_%05d.jpg", stream_id, frame_idx))
```

## Runtime: Nginx Config

### `docker/stream-server/nginx.conf`

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /usr/local/openresty/nginx/conf/mime.types;
    default_type application/octet-stream;

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    lua_package_path "/usr/local/openresty/nginx/lua/?.lua;;";

    server {
        listen 8888;
        server_name _;

        # Dynamic HLS playlist — any stream
        location ~ ^/streams/([^/]+)/live\.m3u8$ {
            set $stream_id $1;
            content_by_lua_file /usr/local/openresty/nginx/lua/playlist.lua;
        }

        # Synchronized snapshot — any stream
        location ~ ^/streams/([^/]+)/snapshot\.jpg$ {
            set $stream_id $1;
            content_by_lua_file /usr/local/openresty/nginx/lua/snapshot.lua;
        }

        # Static segments and frames
        location ~ ^/streams/([^/]+)/ {
            alias /videos/$1/;

            # .ts segments: short cache (client re-fetches via playlist)
            location ~ \.ts$ {
                expires 30s;
                add_header Cache-Control "public";
            }

            # .jpg frames: short cache
            location ~ \.jpg$ {
                expires 1s;
                add_header Cache-Control "public";
            }
        }

        # Health check
        location /health {
            access_log off;
            return 200 "ok\n";
            add_header Content-Type text/plain;
        }

        # CORS headers for all responses
        add_header Access-Control-Allow-Origin '*' always;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS' always;
    }
}
```

## Video Files

Move `docker/mediamtx/videos/*.mp4` → `docker/stream-server/videos/`. Keep `download-samples.sh` updated with new paths.

## Files

| Action | Path |
|--------|------|
| Create | `docker/stream-server/Dockerfile` |
| Create | `docker/stream-server/nginx.conf` |
| Create | `docker/stream-server/prepare-videos.sh` |
| Create | `docker/stream-server/lua/meta.lua` |
| Create | `docker/stream-server/lua/playlist.lua` |
| Create | `docker/stream-server/lua/snapshot.lua` |
| Move   | `docker/mediamtx/videos/` → `docker/stream-server/videos/` |
| Update | `docker/stream-server/download-samples.sh` (copy from mediamtx, update paths) |
| Delete | `docker/mediamtx/` (after migration complete) |
