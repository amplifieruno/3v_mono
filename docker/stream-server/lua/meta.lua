local cjson = require("cjson")
local _M = {}
local cache = {}

function _M.load(stream_id)
  if cache[stream_id] then
    return cache[stream_id]
  end

  local path = "/videos/" .. stream_id .. "/meta.json"
  local f = io.open(path, "r")
  if not f then
    return nil
  end

  local content = f:read("*a")
  f:close()

  local meta = cjson.decode(content)
  cache[stream_id] = meta
  return meta
end

return _M
