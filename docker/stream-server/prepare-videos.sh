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
  # Re-encode with keyframe every 1s to ensure exact segment boundaries
  ffmpeg -i "$video" \
    -c:v libx264 -preset ultrafast -crf 23 \
    -g 24 -keyint_min 24 -sc_threshold 0 \
    -c:a aac -b:a 128k \
    -f hls \
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
