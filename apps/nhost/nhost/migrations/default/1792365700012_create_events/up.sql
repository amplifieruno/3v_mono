-- Events (spec §6.9): state changes, not frames. Append-only, system-written (Stage B evaluate_detection, device
-- health, crons, actions; admin secret / SQL): read-only for org_admin, not audited (spec §8.1), created_at only.
-- Idempotency: dedup_key (e.g. `session:<id>:<type>`, `session:<id>:<type>:<area_id>`, `ap:<id>:<type>:<bucket>`,
-- `occupancy:<id>:<type>`, `device:<id>:<type>:<checked_at>`) is unique per organization, so writers use
-- INSERT ... ON CONFLICT (organization_id, dedup_key) DO NOTHING; NULL = no dedup (one-off events).
-- References to stable entities are composite FKs ON DELETE SET NULL (col) (spec §6.0, logs keep their row);
-- area and access point are same-facility FKs and need facility_id. Log-to-log links (detection_id, session_id,
-- access_decision_id, authentication_attempt_id) are plain indexed uuids without FK (spec §4.1 exception;
-- decisions arrive in slice 8, attempts in slice 9).
CREATE TABLE itap.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL REFERENCES itap.event_types (value),
  severity text NOT NULL DEFAULT 'info' REFERENCES itap.event_severities (value),
  facility_id uuid,
  area_id uuid,
  access_point_id uuid,
  device_id uuid,
  identity_id uuid,
  profile_id uuid,
  detection_id uuid,
  session_id uuid,
  access_decision_id uuid,
  authentication_attempt_id uuid,
  rule_version_id uuid,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  dedup_key text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT events_organization_id_dedup_key_key UNIQUE (organization_id, dedup_key),
  CONSTRAINT events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT events_area_needs_facility CHECK ((area_id IS NULL AND access_point_id IS NULL) OR facility_id IS NOT NULL),
  CONSTRAINT events_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT events_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE SET NULL (area_id),
  CONSTRAINT events_access_point_fkey FOREIGN KEY (organization_id, facility_id, access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (access_point_id),
  CONSTRAINT events_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id) ON DELETE SET NULL (device_id),
  CONSTRAINT events_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT events_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT events_rule_version_fkey FOREIGN KEY (organization_id, rule_version_id)
    REFERENCES itap.event_rule_versions (organization_id, id) ON DELETE SET NULL (rule_version_id)
);

CREATE INDEX events_organization_id_occurred_at_idx ON itap.events (organization_id, occurred_at DESC);
CREATE INDEX events_organization_id_event_type_occurred_at_idx ON itap.events (organization_id, event_type, occurred_at DESC);
CREATE INDEX events_organization_id_severity_idx ON itap.events (organization_id, severity);
CREATE INDEX events_organization_id_facility_id_area_id_idx ON itap.events (organization_id, facility_id, area_id);
CREATE INDEX events_organization_id_facility_id_access_point_id_idx ON itap.events (organization_id, facility_id, access_point_id);
CREATE INDEX events_organization_id_device_id_idx ON itap.events (organization_id, device_id);
CREATE INDEX events_organization_id_identity_id_occurred_at_idx ON itap.events (organization_id, identity_id, occurred_at);
CREATE INDEX events_organization_id_profile_id_idx ON itap.events (organization_id, profile_id);
CREATE INDEX events_organization_id_rule_version_id_idx ON itap.events (organization_id, rule_version_id);
CREATE INDEX events_organization_id_detection_id_idx ON itap.events (organization_id, detection_id);
CREATE INDEX events_organization_id_session_id_idx ON itap.events (organization_id, session_id);
CREATE INDEX events_organization_id_access_decision_id_idx ON itap.events (organization_id, access_decision_id)
  WHERE access_decision_id IS NOT NULL;
CREATE INDEX events_organization_id_authentication_attempt_id_idx ON itap.events (organization_id, authentication_attempt_id)
  WHERE authentication_attempt_id IS NOT NULL;
