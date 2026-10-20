-- Retention policies (spec §6.14; slice 10 task 1). One active policy per (organization, data class, facility);
-- facility_id NULL = organization-wide. Precedence (engine, task 2): a facility-specific policy wins over the
-- organization-wide one within its facility; no policy = keep. Classes and actions are described by two IMMUTABLE
-- helpers that must cover every itap.retention_data_classes value (tested).

-- Classes whose rows belong to one facility (a facility-specific policy is meaningful).
CREATE FUNCTION itap.retention_class_has_facility(p_class text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT p_class IN ('detections', 'locations', 'sessions', 'events', 'incidents', 'access_decisions', 'terminal_syncs', 'stats');
$$;

-- Actions per class: delete for every known class; anonymize where rows keep value without the person (logs with
-- personal references and payload); archive where a row owns files / derived children (reports -> expired, bulk jobs
-- keep the job row without rows and files). Unknown classes: false.
CREATE FUNCTION itap.retention_action_allowed(p_class text, p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_action
    WHEN 'delete' THEN p_class IN (
      'detections', 'locations', 'sessions', 'events', 'deliveries', 'webhook_deliveries', 'incidents', 'photos',
      'embeddings_withdrawn', 'unknown_identities', 'auth_attempts', 'auth_evidence', 'search_history', 'bulk_jobs',
      'reports', 'access_decisions', 'terminal_syncs', 'stats', 'audit', 'trigger_logs')
    WHEN 'anonymize' THEN p_class IN (
      'detections', 'sessions', 'events', 'incidents', 'access_decisions', 'auth_attempts', 'unknown_identities', 'audit')
    WHEN 'archive' THEN p_class IN ('reports', 'bulk_jobs')
    ELSE false
  END;
$$;

CREATE TABLE itap.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  data_class text NOT NULL REFERENCES itap.retention_data_classes (value),
  facility_id uuid,
  retain_days integer NOT NULL,
  action text NOT NULL DEFAULT 'delete' REFERENCES itap.retention_actions (value),
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_policies_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT retention_policies_retain_days CHECK (retain_days BETWEEN 1 AND 36500),
  CONSTRAINT retention_policies_facility_dimension CHECK (facility_id IS NULL OR itap.retention_class_has_facility(data_class)),
  CONSTRAINT retention_policies_action_valid CHECK (itap.retention_action_allowed(data_class, action)),
  -- A facility-specific policy is configuration owned by its facility.
  CONSTRAINT retention_policies_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT retention_policies_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE UNIQUE INDEX retention_policies_active_scope_key ON itap.retention_policies (organization_id, data_class, facility_id)
  NULLS NOT DISTINCT WHERE is_active;
CREATE INDEX retention_policies_organization_id_data_class_idx ON itap.retention_policies (organization_id, data_class);
CREATE INDEX retention_policies_organization_id_facility_id_idx ON itap.retention_policies (organization_id, facility_id);
CREATE INDEX retention_policies_organization_id_created_by_idx ON itap.retention_policies (organization_id, created_by);
CREATE INDEX retention_policies_organization_id_action_idx ON itap.retention_policies (organization_id, action);
CREATE TRIGGER retention_policies_set_updated_at BEFORE UPDATE ON itap.retention_policies
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.retention_policies
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
