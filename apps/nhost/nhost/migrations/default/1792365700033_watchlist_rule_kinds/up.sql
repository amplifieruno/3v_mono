-- Watch-list rules by kind: a version of a `watchlist` rule may restrict itself to some watch-list kinds with
-- parameters.watch_list_kinds (a JSON array of watch / blacklist / vip; absent = all kinds). emit_event applies the
-- filter after matching_rule_versions: blacklist_match -> blacklist, vip_arrival -> vip, watchlist_match -> watch, so
-- e.g. a "Blacklist match" rule can create incidents while a "VIP arrival" rule only announces. Other event types and
-- an explicit p_version (unusual_dwell) are unaffected. Everything else is unchanged from the previous definition.
ALTER TABLE itap.event_rule_versions ADD CONSTRAINT event_rule_versions_watch_list_kinds_valid CHECK (
  NOT (parameters ? 'watch_list_kinds')
  OR (
    jsonb_typeof(parameters -> 'watch_list_kinds') = 'array'
    AND jsonb_array_length(parameters -> 'watch_list_kinds') > 0
    AND (parameters -> 'watch_list_kinds') <@ '["watch", "blacklist", "vip"]'::jsonb
  )
);

CREATE OR REPLACE FUNCTION itap.emit_event(p_event itap.events, p_version uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events := p_event;
  version_ids uuid[] := '{}';
  inserted uuid;
  list_kind text := CASE p_event.event_type
    WHEN 'blacklist_match' THEN 'blacklist' WHEN 'vip_arrival' THEN 'vip' WHEN 'watchlist_match' THEN 'watch'
  END;
BEGIN
  ev.id := gen_random_uuid();
  ev.created_at := now();
  ev.payload := coalesce(ev.payload, '{}');
  ev.severity := coalesce(ev.severity, 'info');
  IF p_version IS NULL THEN
    SELECT coalesce(array_agg(m.version_id ORDER BY itap.severity_rank(m.severity) DESC, m.rule_number), '{}')
    INTO version_ids
    FROM itap.matching_rule_versions(ev.organization_id, itap.event_rule_type(ev.event_type), ev.facility_id, ev.area_id) m
    WHERE list_kind IS NULL OR NOT (m.parameters ? 'watch_list_kinds') OR (m.parameters -> 'watch_list_kinds') ? list_kind;
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
