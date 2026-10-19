CREATE OR REPLACE FUNCTION itap.emit_device_event(
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

CREATE OR REPLACE FUNCTION itap.finish_events(p_organization uuid, p_events uuid[]) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events;
  matched record;
BEGIN
  FOR ev IN
    SELECT e.* FROM unnest(p_events) WITH ORDINALITY AS x (id, n)
    JOIN itap.events e ON e.organization_id = p_organization AND e.id = x.id
    ORDER BY x.n
  LOOP
    FOR matched IN
      SELECT r.id AS rule_id, r.name, v.escalation_policy_id
      FROM jsonb_array_elements_text(coalesce(ev.payload -> 'rule_version_ids', '[]')) AS y (version_id)
      JOIN itap.event_rule_versions v ON v.organization_id = p_organization AND v.id = y.version_id::uuid
      JOIN itap.event_rules r ON r.organization_id = v.organization_id AND r.id = v.rule_id
      WHERE v.creates_incident
      ORDER BY r.id
    LOOP
      PERFORM itap.link_rule_incident(ev, matched.rule_id, matched.name, matched.escalation_policy_id);
    END LOOP;
  END LOOP;
  PERFORM itap.bump_rule_counters(p_organization, p_events);
END;
$$;
