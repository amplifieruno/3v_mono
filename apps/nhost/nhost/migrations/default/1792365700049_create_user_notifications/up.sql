-- In-app inbox (spec §6.12): one row per delivered in_app notification, written by Stage C together with its
-- delivery. Owner-only (metadata: user_id = session user): the owner reads it and sets read_at / acknowledged_at
-- (directly or via mark_notifications_read / acknowledge_notification). Not audited (high volume; audit_log already
-- hides user_notifications rows from other admins). A deactivated member keeps their rows but gets no new ones.
-- delivery_id / event_id are plain log links (spec §4.1); incident is stable history -> SET NULL (incident_id).
CREATE TABLE itap.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivery_id uuid,
  event_id uuid,
  incident_id uuid,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' REFERENCES itap.notification_priorities (value),
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT user_notifications_organization_id_delivery_id_key UNIQUE (organization_id, delivery_id),
  CONSTRAINT user_notifications_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT user_notifications_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE SET NULL (incident_id)
);
CREATE INDEX user_notifications_organization_id_user_id_created_at_idx
  ON itap.user_notifications (organization_id, user_id, created_at DESC);
CREATE INDEX user_notifications_organization_id_incident_id_idx ON itap.user_notifications (organization_id, incident_id);
CREATE INDEX user_notifications_organization_id_event_id_idx ON itap.user_notifications (organization_id, event_id);
CREATE INDEX user_notifications_organization_id_priority_idx ON itap.user_notifications (organization_id, priority);
CREATE INDEX user_notifications_unread_idx ON itap.user_notifications (organization_id, user_id) WHERE read_at IS NULL;

-- Owner edits: read_at / acknowledged_at are stamped with now() (the client chooses only set / clear), acknowledging
-- also marks read, an acknowledgement is final, and it is copied to the delivery.
CREATE FUNCTION itap.user_notifications_stamp() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF OLD.acknowledged_at IS NOT NULL THEN
    NEW.acknowledged_at := OLD.acknowledged_at;
  ELSIF NEW.acknowledged_at IS NOT NULL THEN
    NEW.acknowledged_at := now();
  END IF;
  IF NEW.read_at IS NOT NULL AND OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
  ELSIF NEW.read_at IS NOT NULL THEN
    NEW.read_at := now();
  END IF;
  IF NEW.acknowledged_at IS NOT NULL AND NEW.read_at IS NULL THEN
    NEW.read_at := NEW.acknowledged_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION itap.user_notifications_ack_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  UPDATE itap.notification_deliveries
  SET acknowledged_at = NEW.acknowledged_at
  WHERE organization_id = NEW.organization_id AND id = NEW.delivery_id AND acknowledged_at IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER user_notifications_stamp BEFORE UPDATE OF read_at, acknowledged_at ON itap.user_notifications
  FOR EACH ROW EXECUTE FUNCTION itap.user_notifications_stamp();
CREATE TRIGGER user_notifications_set_updated_at BEFORE UPDATE ON itap.user_notifications
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER user_notifications_ack_delivery AFTER UPDATE OF acknowledged_at ON itap.user_notifications
  FOR EACH ROW WHEN (OLD.acknowledged_at IS NULL AND NEW.acknowledged_at IS NOT NULL)
  EXECUTE FUNCTION itap.user_notifications_ack_delivery();
