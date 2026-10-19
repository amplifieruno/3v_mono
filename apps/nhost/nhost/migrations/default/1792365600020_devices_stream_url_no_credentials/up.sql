-- A stream URL never embeds credentials (rtsp://user:pass@host/..): they belong in devices.username / password
-- (password is write-only and redacted in audit). Rejects any userinfo before the host.
ALTER TABLE itap.devices
  ADD CONSTRAINT devices_stream_url_no_credentials
  CHECK (stream_url IS NULL OR stream_url !~ '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*@');
