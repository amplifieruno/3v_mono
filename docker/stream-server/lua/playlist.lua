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

-- The window ends at the segment playing now: it lists the last `window` finished segments, so
-- the player shows the past few seconds. Each segment carries its wall-clock time
-- (EXT-X-PROGRAM-DATE-TIME), the time at which snapshot.lua served its frames: the console
-- draws a detection when the player reaches the frame it was found on.
-- media_seq is tied to the segment index: (media_seq + i) % total_segs is the file index, so
-- virtual segment URLs resolve via modulo; segment n starts at floor(n / total_segs) * duration
-- + (n % total_segs) * seg_dur on the wall clock.
local window = 6
local loops = math.floor(now / duration)
local media_seq = loops * total_segs + current_seg - window

local function wall_start(n)
  return math.floor(n / total_segs) * duration + (n % total_segs) * seg_dur
end

local function iso(t)
  local ms = math.floor((t - math.floor(t)) * 1000 + 0.5)
  if ms >= 1000 then ms = 999 end
  return os.date("!%Y-%m-%dT%H:%M:%S", math.floor(t)) .. string.format(".%03dZ", ms)
end

ngx.header["Content-Type"] = "application/vnd.apple.mpegurl"
ngx.header["Cache-Control"] = "no-cache, no-store"

local body = "#EXTM3U\n"
body = body .. "#EXT-X-VERSION:3\n"
body = body .. "#EXT-X-TARGETDURATION:" .. seg_dur .. "\n"
body = body .. "#EXT-X-MEDIA-SEQUENCE:" .. string.format("%.0f", media_seq) .. "\n"

for i = 0, window - 1 do
  local n = media_seq + i
  local file_idx = n % total_segs

  -- Signal discontinuity when looping back to the start of the video
  if i > 0 and file_idx == 0 then
    body = body .. "#EXT-X-DISCONTINUITY\n"
  end

  body = body .. "#EXT-X-PROGRAM-DATE-TIME:" .. iso(wall_start(n)) .. "\n"
  -- The last file of the loop is shorter when the video is not a whole number of segments.
  local extinf = seg_dur
  if file_idx == total_segs - 1 then extinf = duration - (total_segs - 1) * seg_dur end
  body = body .. "#EXTINF:" .. string.format("%.3f", extinf) .. ",\n"
  -- Virtual segment URL: unique per segment, resolved via modulo on the server
  body = body .. string.format("/streams/%s/segments/live/%s.ts", stream_id, string.format("%.0f", n)) .. "\n"
end

-- NO #EXT-X-ENDLIST — signals live stream to hls.js
ngx.print(body)
