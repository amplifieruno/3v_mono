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

local path = string.format("/videos/%s/frames/frame_%05d.jpg", stream_id, frame_idx)
local f = io.open(path, "rb")
if not f then
  ngx.status = 404
  ngx.say("Frame not found: " .. path)
  return
end

local data = f:read("*a")
f:close()

ngx.header["Content-Type"] = "image/jpeg"
ngx.header["Cache-Control"] = "no-cache, no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.print(data)
