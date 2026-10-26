#!/usr/bin/env bash
# Usage: scripts/contact-sheet.sh <video.mp4> <sheet.png> [seconds-between-frames]
# One frame every N seconds (default 2), 384 px wide, six per row.
set -euo pipefail
video="$1"; sheet="$2"; every="${3:-2}"
ffmpeg -v error -y -i "$video" -vf "fps=1/${every},scale=384:-1,tile=6x0:padding=4:color=white" -frames:v 1 "$sheet" 2>/dev/null ||
  ffmpeg -v error -y -i "$video" -vf "fps=1/${every},scale=384:-1,tile=6x13:padding=4:color=white" -frames:v 1 "$sheet"
echo "$sheet"
