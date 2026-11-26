#!/usr/bin/env bash
# Usage: scripts/beat-sheet.sh <sheet.png> <clip> [clip ...]
# The last second of each recorded beat (public/clips/<clip>.mp4), 640 px wide, three per row.
set -euo pipefail
sheet="$1"; shift
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
i=0
for clip in "$@"; do
  ffmpeg -v error -y -sseof -1 -i "public/clips/$clip.mp4" -frames:v 1 \
    -vf "scale=640:-1,drawtext=text='$clip':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6" \
    "$tmp/$(printf %03d $i).png"
  i=$((i + 1))
done
ffmpeg -v error -y -pattern_type glob -i "$tmp/*.png" -vf "tile=3x0:padding=4:color=white" -frames:v 1 "$sheet" 2>/dev/null ||
  ffmpeg -v error -y -pattern_type glob -i "$tmp/*.png" -vf "tile=3x$(( (i + 2) / 3 )):padding=4:color=white" -frames:v 1 "$sheet"
echo "$sheet"
