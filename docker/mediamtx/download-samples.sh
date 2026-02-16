#!/bin/bash
# Generates sample surveillance-style test videos for demo virtual cameras
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$SCRIPT_DIR/videos"
mkdir -p "$VIDEO_DIR"

STREAMS=(entrance lobby serverroom warehouse)
LABELS=("Main Entrance" "Lobby" "Server Room" "Warehouse")
COLORS=("0x2d5a27" "0x3a2d5a" "0x5a2d2d" "0x5a4d2d")

if command -v ffmpeg &> /dev/null; then
  for i in "${!STREAMS[@]}"; do
    name="${STREAMS[$i]}"
    label="${LABELS[$i]}"
    color="${COLORS[$i]}"
    if [ ! -f "$VIDEO_DIR/$name.mp4" ]; then
      echo "Generating test video: $name.mp4 ($label)"
      ffmpeg -f lavfi -i "color=c=${color}:s=1280x720:d=30:r=25" \
             -vf "drawtext=text='${label} - %{pts\\:hms}':fontsize=36:fontcolor=white:x=10:y=10,\
drawtext=text='ITAP DEMO':fontsize=24:fontcolor=white@0.5:x=w-tw-10:y=10,\
drawtext=text='$(date +%Y-%m-%d)':fontsize=20:fontcolor=white@0.7:x=10:y=h-30" \
             -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
             "$VIDEO_DIR/$name.mp4" -y
    fi
  done
  echo "All test videos generated in $VIDEO_DIR"
else
  echo "FFmpeg not found. Please install FFmpeg or manually place MP4 files in $VIDEO_DIR/"
  echo "Required files: ${STREAMS[*]}"
fi
