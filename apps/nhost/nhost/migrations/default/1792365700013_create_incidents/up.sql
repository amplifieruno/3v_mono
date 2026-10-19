-- Incidents (spec §6.9): code INCIDENT-xxxxx; status open -> acknowledged -> investigating -> resolved -> closed.
-- Transitions (trigger incidents_validate_transition, applies to every writer):
--   open -> acknowledged | investigating | resolved;  acknowledged -> investigating | resolved;
--   investigating -> resolved;  resolved -> closed | investigating (reopen);  closed is terminal.
-- Status, disposition, acknowledgement, resolution and escalation columns are read-only in metadata: they change
-- through the mutation functions (*_create_incident_functions). escalation_policy_id gets its FK in slice 5.
-- incident_activities is the read-only timeline: trigger incident_activity_log (status / assignment changes,
-- creation), trigger on incident_notes (note), and the functions (escalated). Incidents are history: no delete.
CREATE TABLE itap.incident_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.incident_statuses (value, description) VALUES
  ('open', 'New, not acknowledged'),
  ('acknowledged', 'Acknowledged by an operator'),
  ('investigating', 'Under investigation'),
  ('resolved', 'Resolved with a disposition'),
  ('closed', 'Closed (terminal)');

CREATE TABLE itap.incident_dispositions (value text PRIMARY KEY, description text);
INSERT INTO itap.incident_dispositions (value, description) VALUES
  ('true_positive', 'Real incident'),
  ('false_positive', 'False alarm'),
  ('benign', 'Real but harmless'),
  ('duplicate', 'Duplicate of another incident');

CREATE TABLE itap.incident_activity_kinds (value text PRIMARY KEY, description text);
INSERT INTO itap.incident_activity_kinds (value, description) VALUES
  ('status_change', 'Status changed'),
  ('assigned', 'Assignee changed'),
  ('escalated', 'Escalated to the next step'),
  ('notified', 'Notification sent'),
  ('action_taken', 'Action taken'),
  ('note', 'Note added'),
  ('report_generated', 'Report generated');

CREATE TABLE itap.incident_identity_roles (value text PRIMARY KEY, description text);
INSERT INTO itap.incident_identity_roles (value, description) VALUES
  ('subject', 'Person the incident is about'),
  ('witness', 'Witness'),
  ('related', 'Otherwise related person');

CREATE TABLE itap.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('INCIDENT-' || lpad(number::text, 5, '0')) STORED,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' REFERENCES itap.event_severities (value),
  status text NOT NULL DEFAULT 'open' REFERENCES itap.incident_statuses (value),
  disposition text REFERENCES itap.incident_dispositions (value),
  facility_id uuid,
  area_id uuid,
  assigned_to uuid,
  -- FK to escalation_policies in slice 5; copied from the triggering rule version.
  escalation_policy_id uuid,
  escalation_step integer NOT NULL DEFAULT 0,
  last_escalated_at timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  external_ref text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT incidents_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT incidents_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT incidents_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT incidents_escalation_step_nonnegative CHECK (escalation_step >= 0),
  CONSTRAINT incidents_area_needs_facility CHECK (area_id IS NULL OR facility_id IS NOT NULL),
  -- Anything past open has been acknowledged (explicitly or implicitly by investigating / resolving).
  CONSTRAINT incidents_acknowledged_consistent CHECK (status = 'open' OR acknowledged_at IS NOT NULL),
  CONSTRAINT incidents_resolved_consistent CHECK (
    status NOT IN ('resolved', 'closed') OR (resolved_at IS NOT NULL AND disposition IS NOT NULL)
  ),
  CONSTRAINT incidents_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT incidents_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE SET NULL (area_id),
  CONSTRAINT incidents_assigned_to_fkey FOREIGN KEY (organization_id, assigned_to)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT incidents_acknowledged_by_fkey FOREIGN KEY (organization_id, acknowledged_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT incidents_resolved_by_fkey FOREIGN KEY (organization_id, resolved_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT incidents_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX incidents_organization_id_created_at_idx ON itap.incidents (organization_id, created_at DESC);
CREATE INDEX incidents_organization_id_status_idx ON itap.incidents (organization_id, status);
CREATE INDEX incidents_organization_id_severity_idx ON itap.incidents (organization_id, severity);
CREATE INDEX incidents_organization_id_disposition_idx ON itap.incidents (organization_id, disposition);
CREATE INDEX incidents_organization_id_facility_id_area_id_idx ON itap.incidents (organization_id, facility_id, area_id);
CREATE INDEX incidents_organization_id_assigned_to_idx ON itap.incidents (organization_id, assigned_to);
CREATE INDEX incidents_organization_id_acknowledged_by_idx ON itap.incidents (organization_id, acknowledged_by);
CREATE INDEX incidents_organization_id_resolved_by_idx ON itap.incidents (organization_id, resolved_by);
CREATE INDEX incidents_organization_id_created_by_idx ON itap.incidents (organization_id, created_by);
CREATE INDEX incidents_organization_id_escalation_policy_id_idx ON itap.incidents (organization_id, escalation_policy_id);
-- Escalation cron (slice 5): unacknowledged incidents.
CREATE INDEX incidents_unacknowledged_idx ON itap.incidents (organization_id, last_escalated_at)
  WHERE acknowledged_at IS NULL;

CREATE FUNCTION itap.incident_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT (p_from, p_to) IN (
    ('open', 'acknowledged'), ('open', 'investigating'), ('open', 'resolved'),
    ('acknowledged', 'investigating'), ('acknowledged', 'resolved'),
    ('investigating', 'resolved'),
    ('resolved', 'closed'), ('resolved', 'investigating')
  );
$$;

CREATE FUNCTION itap.incidents_validate_transition() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT itap.incident_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('incident_invalid_transition');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE itap.incident_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  actor_id uuid,
  kind text NOT NULL REFERENCES itap.incident_activity_kinds (value),
  details jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_activities_details_object CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT incident_activities_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT incident_activities_actor_fkey FOREIGN KEY (organization_id, actor_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX incident_activities_organization_id_incident_id_occurred_at_idx
  ON itap.incident_activities (organization_id, incident_id, occurred_at);
CREATE INDEX incident_activities_organization_id_actor_id_idx ON itap.incident_activities (organization_id, actor_id);
CREATE INDEX incident_activities_organization_id_kind_idx ON itap.incident_activities (organization_id, kind);

-- Session member (actor of an activity), else NULL (system / admin secret without a member session).
CREATE FUNCTION itap.session_member(p_organization_id uuid) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT itap.organization_member(
    p_organization_id,
    itap.session_user_id(nullif(current_setting('hasura.user', true), '')::json)
  );
$$;

-- incident_activity_log (spec §8.1): creation and status changes -> status_change {from, to[, disposition]},
-- assignee changes -> assigned {from, to}; actor = the session member.
CREATE FUNCTION itap.incident_activity_log() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  actor uuid := itap.session_member(NEW.organization_id);
  details jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    details := jsonb_build_object('from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, 'to', NEW.status);
    IF NEW.status = 'resolved' THEN
      details := details || jsonb_build_object('disposition', NEW.disposition, 'resolution', NEW.resolution);
    END IF;
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
    VALUES (NEW.organization_id, NEW.id, actor, 'status_change', details);
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
    VALUES (
      NEW.organization_id, NEW.id, actor, 'assigned',
      jsonb_build_object('from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END, 'to', NEW.assigned_to)
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER incidents_number BEFORE INSERT ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('incident');
CREATE TRIGGER incidents_set_updated_at BEFORE UPDATE ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER incidents_active_member_check BEFORE INSERT OR UPDATE OF assigned_to ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('assigned_to');
CREATE TRIGGER incidents_validate_transition BEFORE UPDATE OF status ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.incidents_validate_transition();
CREATE TRIGGER incident_activity_log AFTER INSERT OR UPDATE OF status, assigned_to ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.incident_activity_log();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Links (owned junction rows, CASCADE from the incident). event_id is a log link without FK (spec §4.1); a
-- trigger checks the event exists in the organization when the link is written.
CREATE TABLE itap.incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_events_organization_id_incident_id_event_id_key UNIQUE (organization_id, incident_id, event_id),
  CONSTRAINT incident_events_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX incident_events_organization_id_event_id_idx ON itap.incident_events (organization_id, event_id);

CREATE FUNCTION itap.incident_events_check_event() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.events e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.event_id) THEN
    PERFORM itap.raise_code('event_not_found');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incident_events_check_event BEFORE INSERT OR UPDATE OF event_id ON itap.incident_events
  FOR EACH ROW EXECUTE FUNCTION itap.incident_events_check_event();
CREATE TRIGGER incident_events_set_updated_at BEFORE UPDATE ON itap.incident_events
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incident_events
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.incident_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'subject' REFERENCES itap.incident_identity_roles (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_identities_organization_id_incident_id_identity_id_key UNIQUE (organization_id, incident_id, identity_id),
  CONSTRAINT incident_identities_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT incident_identities_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX incident_identities_organization_id_identity_id_idx ON itap.incident_identities (organization_id, identity_id);
CREATE INDEX incident_identities_organization_id_role_idx ON itap.incident_identities (organization_id, role);

CREATE TRIGGER incident_identities_set_updated_at BEFORE UPDATE ON itap.incident_identities
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incident_identities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Notes: author = the session member (stamped, read-only in metadata, must be active); editable by the author.
CREATE TABLE itap.incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_notes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT incident_notes_body_not_blank CHECK (btrim(body) <> ''),
  CONSTRAINT incident_notes_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT incident_notes_author_fkey FOREIGN KEY (organization_id, author_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX incident_notes_organization_id_incident_id_idx ON itap.incident_notes (organization_id, incident_id);
CREATE INDEX incident_notes_organization_id_author_id_idx ON itap.incident_notes (organization_id, author_id);

CREATE FUNCTION itap.incident_notes_log_activity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
  VALUES (NEW.organization_id, NEW.incident_id, NEW.author_id, 'note', jsonb_build_object('note_id', NEW.id));
  RETURN NULL;
END;
$$;

-- BEFORE triggers fire in name order: the stamp (author_stamp) runs before the active check (check_author_active).
CREATE TRIGGER incident_notes_author_stamp BEFORE INSERT ON itap.incident_notes
  FOR EACH ROW EXECUTE FUNCTION itap.stamp_session_member('author_id');
CREATE TRIGGER incident_notes_check_author_active BEFORE INSERT OR UPDATE OF author_id ON itap.incident_notes
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('author_id');
CREATE TRIGGER incident_notes_set_updated_at BEFORE UPDATE ON itap.incident_notes
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER incident_notes_log_activity AFTER INSERT ON itap.incident_notes
  FOR EACH ROW EXECUTE FUNCTION itap.incident_notes_log_activity();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incident_notes
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.incident_note_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  note_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES storage.files (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_note_files_organization_id_note_id_file_id_key UNIQUE (organization_id, note_id, file_id),
  CONSTRAINT incident_note_files_note_fkey FOREIGN KEY (organization_id, note_id)
    REFERENCES itap.incident_notes (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX incident_note_files_organization_id_file_id_idx ON itap.incident_note_files (organization_id, file_id);

CREATE TRIGGER incident_note_files_check_files BEFORE INSERT OR UPDATE OF file_id ON itap.incident_note_files
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('file_id');
CREATE TRIGGER incident_note_files_set_updated_at BEFORE UPDATE ON itap.incident_note_files
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incident_note_files
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
