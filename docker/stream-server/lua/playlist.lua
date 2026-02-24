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

-- Clamp to valid range (safety for floating-point edge cases)
if current_seg >= total_segs then
  current_seg = total_segs - 1
end

-- Compute media_seq tied to the segment index, not wall clock.
-- This ensures (media_seq + i) % total_segs == (current_seg + i) % total_segs,
-- so virtual segment URLs resolve correctly via modulo.
local loops = math.floor(now / duration)
local media_seq = loops * total_segs + current_seg

-- 6-segment window for ~6s buffer (more resilient to network latency)
local window = 6

ngx.header["Content-Type"] = "application/vnd.apple.mpegurl"
ngx.header["Cache-Control"] = "no-cache, no-store"

local body = "#EXTM3U\n"
body = body .. "#EXT-X-VERSION:3\n"
body = body .. "#EXT-X-TARGETDURATION:" .. seg_dur .. "\n"
body = body .. "#EXT-X-MEDIA-SEQUENCE:" .. string.format("%.0f", media_seq) .. "\n"

for i = 0, window - 1 do
  local file_idx = (current_seg + i) % total_segs
  local prev_file_idx = (current_seg + i - 1) % total_segs

  -- Signal discontinuity when looping back to the start of the video
  if i > 0 and file_idx < prev_file_idx then
    body = body .. "#EXT-X-DISCONTINUITY\n"
  end

  body = body .. "#EXTINF:" .. string.format("%.3f", seg_dur) .. ",\n"
  -- Virtual segment URL: unique per wall-clock second, resolved via modulo on the server
  body = body .. string.format("/streams/%s/segments/live/%s.ts",
    stream_id, string.format("%.0f", media_seq + i)) .. "\n"
end

-- NO #EXT-X-ENDLIST — signals live stream to hls.js
ngx.print(body)
