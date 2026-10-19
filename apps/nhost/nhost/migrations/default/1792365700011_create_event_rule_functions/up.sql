-- Tracked mutations for versioned event rules (org_admin, session organization only):
--   create_event_rule_draft(rule)      -> the rule's open draft (created as a copy of the current version with its
--                                         scopes when there is none; idempotent);
--   publish_event_rule_version(version) -> publishes (or rolls back to) the version; audit row `publish`.
CREATE FUNCTION itap.create_event_rule_draft(hasura_session json, p_rule uuid)
RETURNS SETOF itap.event_rule_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  draft uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.event_rules WHERE organization_id = org AND id = p_rule) THEN
    PERFORM itap.raise_code('event_rule_not_found');
  END IF;
  draft := itap.create_draft_version(
    'itap.event_rule_versions', 'itap.event_rules', 'rule_id',
    ARRAY['itap.event_rule_version_scopes'::regclass], org, p_rule
  );
  RETURN QUERY SELECT * FROM itap.event_rule_versions WHERE organization_id = org AND id = draft;
END;
$$;

CREATE FUNCTION itap.publish_event_rule_version(hasura_session json, p_version uuid)
RETURNS SETOF itap.event_rule_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  rule uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.event_rule_versions WHERE organization_id = org AND id = p_version) THEN
    PERFORM itap.raise_code('event_rule_version_not_found');
  END IF;
  rule := itap.publish_version(
    'itap.event_rule_versions', 'itap.event_rules', 'rule_id', org, p_version, itap.organization_member(org, actor)
  );
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (org, actor, 'publish', 'event_rule_versions', p_version, jsonb_build_object('rule_id', rule));
  RETURN QUERY SELECT * FROM itap.event_rule_versions WHERE organization_id = org AND id = p_version;
END;
$$;
