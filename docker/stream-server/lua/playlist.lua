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
