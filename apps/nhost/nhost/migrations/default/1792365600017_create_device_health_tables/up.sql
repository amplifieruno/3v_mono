-- Device telemetry (spec §6.7): append-only, read-only for clients, written only by itap.record_device_health
-- (health check cron). High volume, so no audit trigger. Device history is kept: a device that has telemetry cannot be
-- deleted (NO ACTION), retire it with status 'inactive' (spec §6.0).
CREATE TABLE itap.device_event_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.device_event_kinds (value, description) VALUES
  ('online', 'Device became reachable'),
  ('offline', 'Device became unreachable'),
  ('error', 'Device reachable but misbehaving (e.g. no frames)'),
  ('config_changed', 'Configuration changed'),
  ('reboot', 'Device rebooted'),
  ('firmware_update', 'Firmware updated');

CREATE TABLE itap.device_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  -- Host metrics are NULL for devices that do not expose them (cameras behind the stream-server).
  cpu_usage real,
  memory_usage real,
  disk_usage real,
  network_latency_ms real,
  frame_rate real,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One sample per device and check time: makes cron retries idempotent.
  CONSTRAINT device_health_metrics_organization_id_device_id_recorded_at_key UNIQUE (organization_id, device_id, recorded_at),
  CONSTRAINT device_health_metrics_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id),
  CONSTRAINT device_health_metrics_usage_range CHECK (
    (cpu_usage IS NULL OR cpu_usage BETWEEN 0 AND 100)
    AND (memory_usage IS NULL OR memory_usage BETWEEN 0 AND 100)
    AND (disk_usage IS NULL OR disk_usage BETWEEN 0 AND 100)
  ),
  CONSTRAINT device_health_metrics_non_negative CHECK (
    (network_latency_ms IS NULL OR network_latency_ms >= 0) AND (frame_rate IS NULL OR frame_rate >= 0) AND error_count >= 0
  )
);
CREATE INDEX device_health_metrics_organization_id_recorded_at_idx ON itap.device_health_metrics (organization_id, recorded_at);

CREATE TABLE itap.device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  kind text NOT NULL REFERENCES itap.device_event_kinds (value),
  message text,
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_events_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id),
  CONSTRAINT device_events_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX device_events_organization_id_device_id_occurred_at_idx ON itap.device_events (organization_id, device_id, occurred_at DESC);
CREATE INDEX device_events_organization_id_kind_occurred_at_idx ON itap.device_events (organization_id, kind, occurred_at DESC);
