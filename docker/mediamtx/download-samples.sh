#!/bin/bash
# Downloads/generates sample surveillance-style videos for demo virtual cameras
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$SCRIPT_DIR/videos"
mkdir -p "$VIDEO_DIR"

# Generate test videos using FFmpeg if available
if command -v ffmpeg &> /dev/null; then
  for name in entrance lobby parking; do
    if [ ! -f "$VIDEO_DIR/$name.mp4" ]; then
      echo "Generating test video: $name.mp4"
      ffmpeg -f lavfi -i "testsrc=duration=30:size=1280x720:rate=25" \
             -f lavfi -i "sine=frequency=1000:duration=30" \
             -vf "drawtext=text='$name cam - %{pts\\:hms}':fontsize=36:fontcolor=white:x=10:y=10" \
             -c:v libx264 -preset ultrafast -c:a aac \
             "$VIDEO_DIR/$name.mp4"
    fi
  done
else
  echo "FFmpeg not found. Please install FFmpeg or manually place MP4 files in $VIDEO_DIR/"
  echo "Required files: entrance.mp4, lobby.mp4, parking.mp4"
fi
