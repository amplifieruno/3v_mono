-- Shift handovers (spec §6.9): the sending operator (from_user_id, stamped from the session member, read-only in
-- metadata) hands over to an active member (to_user_id) with a summary and the incidents still open. Only the
-- recipient acknowledges, through acknowledge_shift_handover (acknowledged_at is read-only in metadata); an
-- acknowledged handover is frozen for the sender (update/delete permissions filter on acknowledged_at IS NULL).
CREATE TABLE itap.shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  shift_started_at timestamptz NOT NULL,
  shift_ended_at timestamptz,
  summary text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_handovers_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT shift_handovers_distinct_users CHECK (from_user_id <> to_user_id),
  CONSTRAINT shift_handovers_times_ordered CHECK (shift_ended_at IS NULL OR shift_ended_at >= shift_started_at),
  CONSTRAINT shift_handovers_from_user_fkey FOREIGN KEY (organization_id, from_user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT shift_handovers_to_user_fkey FOREIGN KEY (organization_id, to_user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX shift_handovers_organization_id_from_user_id_idx ON itap.shift_handovers (organization_id, from_user_id);
CREATE INDEX shift_handovers_organization_id_to_user_id_idx ON itap.shift_handovers (organization_id, to_user_id);
CREATE INDEX shift_handovers_organization_id_shift_started_at_idx ON itap.shift_handovers (organization_id, shift_started_at DESC);

CREATE TRIGGER shift_handovers_from_stamp BEFORE INSERT ON itap.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION itap.stamp_session_member('from_user_id');
CREATE TRIGGER shift_handovers_to_active_member_check BEFORE INSERT OR UPDATE OF to_user_id ON itap.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('to_user_id');
CREATE TRIGGER shift_handovers_set_updated_at BEFORE UPDATE ON itap.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.shift_handover_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  handover_id uuid NOT NULL,
  incident_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_handover_incidents_organization_id_handover_id_incident_id_key
    UNIQUE (organization_id, handover_id, incident_id),
  CONSTRAINT shift_handover_incidents_handover_fkey FOREIGN KEY (organization_id, handover_id)
    REFERENCES itap.shift_handovers (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT shift_handover_incidents_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX shift_handover_incidents_organization_id_incident_id_idx
  ON itap.shift_handover_incidents (organization_id, incident_id);

CREATE TRIGGER shift_handover_incidents_set_updated_at BEFORE UPDATE ON itap.shift_handover_incidents
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.shift_handover_incidents
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- The recipient acknowledges (idempotent); anyone else gets handover_not_recipient.
CREATE FUNCTION itap.acknowledge_shift_handover(hasura_session json, p_handover uuid)
RETURNS SETOF itap.shift_handovers
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  handover itap.shift_handovers;
BEGIN
  SELECT * INTO handover FROM itap.shift_handovers WHERE organization_id = org AND id = p_handover FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('handover_not_found');
  END IF;
  IF handover.to_user_id IS DISTINCT FROM itap.session_user_id(hasura_session) THEN
    PERFORM itap.raise_code('handover_not_recipient');
  END IF;
  IF handover.acknowledged_at IS NULL THEN
    UPDATE itap.shift_handovers SET acknowledged_at = now()
    WHERE organization_id = org AND id = p_handover
    RETURNING * INTO handover;
  END IF;
  RETURN NEXT handover;
END;
$$;
