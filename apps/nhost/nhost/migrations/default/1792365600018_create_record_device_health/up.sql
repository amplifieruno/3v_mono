-- itap.record_device_health (spec §8.3 device_health_check): applies one probe result of the health check cron.
-- Internal: tracked for no role (admin secret only). Idempotent per (device, p_checked_at): a retry of the same cron
-- run finds its metric row and changes nothing (no state update, no events).
--
-- * Metric row: network_latency_ms from the probe, frame_rate NULL (the stream-server exposes none), error_count
--   0/1 (1 when not healthy), cpu/memory/disk NULL.
-- * health_status: reachable + frame -> healthy; reachable, no frame -> warning; unreachable -> critical.
-- * last_seen_at = p_checked_at when reachable. Device status: unreachable and 'active' -> 'connection_error';
--   reachable and 'connection_error' -> 'active'. Other statuses (inactive, maintenance, error) are never touched.
-- * device_events only on transitions of health_status: ->critical = offline, critical->(healthy|warning) = online,
--   ->warning from healthy/unknown = error. Staying in a state emits nothing. Platform `events` come in slice 4.
-- * Serialised per device with a row lock; p_checked_at older than the newest sample still records its metric but
--   does not move the state backwards.
CREATE FUNCTION itap.record_device_health(
  p_device uuid, p_reachable boolean, p_latency_ms real, p_frame_ok boolean, p_checked_at timestamptz
)
RETURNS SETOF itap.devices
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.devices;
  inserted integer;
  newer boolean;
  new_health text;
  new_status text;
BEGIN
  SELECT * INTO d FROM itap.devices WHERE id = p_device FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('device_not_found');
  END IF;

  new_health := CASE WHEN NOT p_reachable THEN 'critical' WHEN p_frame_ok THEN 'healthy' ELSE 'warning' END;

  SELECT EXISTS (
    SELECT 1 FROM itap.device_health_metrics m WHERE m.device_id = d.id AND m.recorded_at > p_checked_at
  ) INTO newer;

  INSERT INTO itap.device_health_metrics (organization_id, device_id, recorded_at, network_latency_ms, error_count)
  VALUES (d.organization_id, d.id, p_checked_at, CASE WHEN p_reachable THEN p_latency_ms END,
          CASE WHEN new_health = 'healthy' THEN 0 ELSE 1 END)
  ON CONFLICT (organization_id, device_id, recorded_at) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted = 1 AND NOT newer THEN
    new_status := CASE
      WHEN NOT p_reachable AND d.status = 'active' THEN 'connection_error'
      WHEN p_reachable AND d.status = 'connection_error' THEN 'active'
      ELSE d.status
    END;

    IF new_health <> d.health_status THEN
      IF new_health = 'critical' THEN
        INSERT INTO itap.device_events (organization_id, device_id, kind, message, payload, occurred_at)
        VALUES (d.organization_id, d.id, 'offline', 'Device is unreachable',
                jsonb_build_object('previous_health_status', d.health_status), p_checked_at);
      ELSE
        IF d.health_status = 'critical' THEN
          INSERT INTO itap.device_events (organization_id, device_id, kind, message, payload, occurred_at)
          VALUES (d.organization_id, d.id, 'online', 'Device is reachable again',
                  jsonb_build_object('latency_ms', p_latency_ms), p_checked_at);
        END IF;
        IF new_health = 'warning' THEN
          INSERT INTO itap.device_events (organization_id, device_id, kind, message, payload, occurred_at)
          VALUES (d.organization_id, d.id, 'error', 'Device is reachable but delivers no frame',
                  jsonb_build_object('latency_ms', p_latency_ms), p_checked_at);
        END IF;
      END IF;
    END IF;

    UPDATE itap.devices
    SET health_status = new_health,
        status = new_status,
        last_seen_at = CASE WHEN p_reachable THEN p_checked_at ELSE last_seen_at END
    WHERE id = d.id;
  END IF;

  RETURN QUERY SELECT * FROM itap.devices WHERE id = d.id;
END;
$$;
REVOKE ALL ON FUNCTION itap.record_device_health(uuid, boolean, real, boolean, timestamptz) FROM PUBLIC;
