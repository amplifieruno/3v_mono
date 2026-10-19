-- event_rule_version_scopes.segment_id gets its FK now that segments exist (slice 4 left it unconstrained; no row
-- could name a segment yet). A segment named by a scope cannot be deleted (configuration -> NO ACTION).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM itap.event_rule_version_scopes WHERE segment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'event_rule_version_scopes has segment_id values without segments; clear them first';
  END IF;
END;
$$;
ALTER TABLE itap.event_rule_version_scopes
  ADD CONSTRAINT event_rule_version_scopes_segment_fkey FOREIGN KEY (organization_id, segment_id)
    REFERENCES itap.segments (organization_id, id) ON DELETE NO ACTION;
