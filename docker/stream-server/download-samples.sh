#!/bin/bash
# Downloads sample surveillance-style videos with people for demo streams.
# Videos are sourced from Pexels (free, no attribution required).
#
# Usage:
#   ./download-samples.sh              # Download to local videos/ dir
#   ./download-samples.sh --deploy     # Download + rebuild stream-server container

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="${VIDEO_DIR:-$SCRIPT_DIR/videos}"
CONTAINER_NAME="itap-stream-server"
DEPLOY=false

if [ "$1" = "--deploy" ]; then
  DEPLOY=true
fi

mkdir -p "$VIDEO_DIR"

# Pexels video IDs — people walking, faces visible
# Replace these with your own Pexels video URLs if needed
# Find videos at: https://www.pexels.com/search/videos/people%20walking/
declare -A VIDEOS=(
  [entrance]="https://videos.pexels.com/video-files/18123867/18123867-hd_1920_1080_25fps.mp4"
  [lobby]="https://videos.pexels.com/video-files/1721303/1721303-hd_1920_1080_25fps.mp4"
  [serverroom]="https://videos.pexels.com/video-files/20402896/20402896-sd_960_540_25fps.mp4"
  [warehouse]="https://videos.pexels.com/video-files/3205624/3205624-hd_1920_1080_25fps.mp4"
)

echo "Downloading sample videos..."
for name in entrance lobby serverroom warehouse; do
  url="${VIDEOS[$name]}"
  dest="$VIDEO_DIR/$name.mp4"

  if [ -f "$dest" ] && [ "$FORCE" != "true" ]; then
    echo "  $name.mp4 already exists (use FORCE=true to overwrite)"
    continue
  fi

  echo "  Downloading $name.mp4..."
  if curl -L -f -o "$dest" "$url" 2>/dev/null; then
    echo "  OK: $name.mp4 ($(du -h "$dest" | cut -f1))"
  else
    echo "  FAILED: $name.mp4 — URL may be outdated."
    echo "  Browse https://www.pexels.com/search/videos/people%20walking/"
    echo "  and update the URL in this script."
    rm -f "$dest"
  fi
done

echo ""
echo "Videos in $VIDEO_DIR:"
ls -lh "$VIDEO_DIR"/*.mp4 2>/dev/null || echo "  (none)"

# Deploy: rebuild the stream-server container (videos are baked in at build time)
if [ "$DEPLOY" = true ]; then
  echo ""
  echo "Rebuilding stream-server container..."
  docker compose -f "$SCRIPT_DIR/../../docker/docker-compose.prod.yml" \
    build stream-server --no-cache
  echo "Restarting stream-server..."
  docker compose -f "$SCRIPT_DIR/../../docker/docker-compose.prod.yml" \
    up -d stream-server
  echo "Done! Streams should be available in a few seconds."
fi
