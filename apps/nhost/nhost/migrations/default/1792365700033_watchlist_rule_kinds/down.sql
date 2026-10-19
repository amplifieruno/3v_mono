-- Restores emit_event without the watch-list kind filter and drops the parameters check.
ALTER TABLE itap.event_rule_versions DROP CONSTRAINT event_rule_versions_watch_list_kinds_valid;
CREATE OR REPLACE FUNCTION itap.emit_event(p_event itap.events, p_version uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events := p_event;
  version_ids uuid[] := '{}';
  inserted uuid;
BEGIN
  ev.id := gen_random_uuid();
  ev.created_at := now();
  ev.payload := coalesce(ev.payload, '{}');
  ev.severity := coalesce(ev.severity, 'info');
  IF p_version IS NULL THEN
    SELECT coalesce(array_agg(m.version_id ORDER BY itap.severity_rank(m.severity) DESC, m.rule_number), '{}')
    INTO version_ids
    FROM itap.matching_rule_versions(ev.organization_id, itap.event_rule_type(ev.event_type), ev.facility_id, ev.area_id) m;
  ELSE
    SELECT coalesce(array_agg(v.id), '{}') INTO version_ids FROM itap.event_rule_versions v
    WHERE v.organization_id = ev.organization_id AND v.id = p_version;
  END IF;
  IF cardinality(version_ids) > 0 THEN
    ev.rule_version_id := version_ids[1];
    IF ev.event_type NOT IN ('watchlist_match', 'blacklist_match', 'vip_arrival') THEN
      SELECT v.severity INTO ev.severity FROM itap.event_rule_versions v
      WHERE v.organization_id = ev.organization_id AND v.id = version_ids[1];
    END IF;
    ev.payload := ev.payload || jsonb_build_object('rule_version_ids', to_jsonb(version_ids));
  END IF;

  INSERT INTO itap.events SELECT (ev).*
  ON CONFLICT (organization_id, dedup_key) DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN inserted;
END;
$$;
