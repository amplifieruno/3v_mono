-- Platform events for device health transitions (spec §8.3 device_health_check, carried from slice 3):
-- itap.record_device_health now also writes `events` next to each device_events row: offline -> device_offline
-- (high), online -> device_online (info), error -> device_error (medium). Facility / area / device come from the
-- device. Dedup key device:<device_id>:<type>:<checked_at epoch ms>, inserted ON CONFLICT DO NOTHING, so a retried
-- cron run (same checked_at) writes nothing (the function is already idempotent per (device, checked_at)).
-- Device events match no event rule type, so they carry no rule_version_id.

-- Internal helper (not tracked).
CREATE FUNCTION itap.emit_device_event(
  p_device itap.devices, p_type text, p_severity text, p_title text, p_payload jsonb, p_at timestamptz
) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  INSERT INTO itap.events
    (organization_id, event_type, severity, facility_id, area_id, device_id, title, payload, dedup_key, occurred_at)
  VALUES (
    p_device.organization_id, p_type, p_severity, p_device.facility_id, p_device.area_id, p_device.id,
    p_title || ': ' || p_device.name, p_payload,
    'device:' || p_device.id || ':' || p_type || ':' || (extract(epoch FROM p_at) * 1000)::bigint, p_at
  )
  ON CONFLICT (organization_id, dedup_key) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION itap.record_device_health(
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
        PERFORM itap.emit_device_event(d, 'device_offline', 'high', 'Device went offline',
                                       jsonb_build_object('previous_health_status', d.health_status), p_checked_at);
      ELSE
        IF d.health_status = 'critical' THEN
          INSERT INTO itap.device_events (organization_id, device_id, kind, message, payload, occurred_at)
          VALUES (d.organization_id, d.id, 'online', 'Device is reachable again',
                  jsonb_build_object('latency_ms', p_latency_ms), p_checked_at);
          PERFORM itap.emit_device_event(d, 'device_online', 'info', 'Device came back online',
                                         jsonb_build_object('latency_ms', p_latency_ms), p_checked_at);
        END IF;
        IF new_health = 'warning' THEN
          INSERT INTO itap.device_events (organization_id, device_id, kind, message, payload, occurred_at)
          VALUES (d.organization_id, d.id, 'error', 'Device is reachable but delivers no frame',
                  jsonb_build_object('latency_ms', p_latency_ms), p_checked_at);
          PERFORM itap.emit_device_event(d, 'device_error', 'medium', 'Device delivers no frame',
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
