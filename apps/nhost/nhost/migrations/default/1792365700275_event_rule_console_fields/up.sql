-- Computed fields for the console's event rules (read by org_admin through the existing select permissions):
-- * event_rule_versions.rule_type: the rule type of the version's header, so the version's parameters editor
--   knows which parameters the type takes (parameters are per rule type: unusual_dwell -> dwell_seconds,
--   watchlist -> watch_list_kinds; the other types take none);
-- * incidents.rule_id: the event rule that opened the incident. itap.link_rule_incident keys every incident it
--   opens by the rule (`...:rule:<rule id>[:bucket]`); NULL for an incident opened by hand or whose rule was
--   deleted.
CREATE FUNCTION itap.event_rule_version_rule_type(version_row itap.event_rule_versions) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT r.rule_type FROM itap.event_rules r
  WHERE r.organization_id = version_row.organization_id AND r.id = version_row.rule_id;
$$;

CREATE FUNCTION itap.incident_rule_id(incident_row itap.incidents) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT r.id FROM itap.event_rules r
  WHERE r.organization_id = incident_row.organization_id
    AND r.id::text = substring(incident_row.dedup_key FROM ':rule:([0-9a-f-]{36})');
$$;
