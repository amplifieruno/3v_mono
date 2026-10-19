-- Tracking state (spec §6.8), maintained only by Stage A (itap.track_detection, next migration) and the
-- stale-session cron: read-only for org_admin, not audited (system state derived from detections, spec §8.1).
-- References to stable entities are ON DELETE SET NULL (col) for history rows (sessions, locations) and CASCADE for
-- the current-state rows of area_occupancy.

-- One visit of an identity to a facility. At most one active session per (identity, facility): the partial unique
-- index is the backstop of Stage A's per-identity advisory lock. duration_seconds is derived from started_at/ended_at.
-- visit_id gets its FK with the visits table (slice 4, task 4).
-- profile_id is the identity's profile captured when the session opens (a later re-link does not rewrite history).
-- opened_by_detection_id: the detection that opened the session (log-to-log link without FK, spec §4.1); Stage B
-- uses it to recognise the session-opening detection.
-- last_access_point_id: access point of the latest in-order detection (NULL when it was at none); decides
-- completed/lost on close. last_location_access_point_id: access point of the latest written location; Stage A
-- writes a new location only when the area or this value changes, so alternating door / non-door cameras in one
-- area do not write a location per detection.
-- Timestamps: a detection with detected_at equal to last_detected_at is in order (it extends the session).
-- Indexes avoid last_detected_at so the per-detection session update can stay HOT when only it changes.
CREATE TABLE itap.tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid,
  profile_id uuid,
  facility_id uuid,
  visit_id uuid,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.tracking_session_statuses (value),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (extract(epoch FROM ended_at - started_at)::integer) STORED,
  last_detected_at timestamptz NOT NULL,
  last_area_id uuid,
  last_access_point_id uuid,
  last_location_access_point_id uuid,
  opened_by_detection_id uuid,
  -- System cache (spec §6.0 array exception): distinct areas in order of first visit.
  areas_visited uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_sessions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT tracking_sessions_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT tracking_sessions_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT tracking_sessions_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT tracking_sessions_last_area_fkey FOREIGN KEY (organization_id, facility_id, last_area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE SET NULL (last_area_id),
  CONSTRAINT tracking_sessions_last_access_point_fkey FOREIGN KEY (organization_id, facility_id, last_access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (last_access_point_id),
  CONSTRAINT tracking_sessions_last_location_access_point_fkey
    FOREIGN KEY (organization_id, facility_id, last_location_access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (last_location_access_point_id),
  CONSTRAINT tracking_sessions_times_ordered CHECK (
    last_detected_at >= started_at AND (ended_at IS NULL OR ended_at >= started_at)
  ),
  CONSTRAINT tracking_sessions_ended_iff_closed CHECK ((status = 'active') = (ended_at IS NULL))
);

CREATE UNIQUE INDEX tracking_sessions_one_active_key ON itap.tracking_sessions (organization_id, identity_id, facility_id)
  WHERE status = 'active';
CREATE INDEX tracking_sessions_organization_id_identity_id_facility_id_started_at_idx
  ON itap.tracking_sessions (organization_id, identity_id, facility_id, started_at);
CREATE INDEX tracking_sessions_organization_id_status_idx ON itap.tracking_sessions (organization_id, status);
CREATE INDEX tracking_sessions_organization_id_profile_id_idx ON itap.tracking_sessions (organization_id, profile_id);
CREATE INDEX tracking_sessions_organization_id_facility_id_status_idx
  ON itap.tracking_sessions (organization_id, facility_id, status);
CREATE INDEX tracking_sessions_organization_id_facility_id_last_area_id_idx
  ON itap.tracking_sessions (organization_id, facility_id, last_area_id);
CREATE INDEX tracking_sessions_organization_id_facility_id_last_access_point_id_idx
  ON itap.tracking_sessions (organization_id, facility_id, last_access_point_id);
CREATE INDEX tracking_sessions_organization_id_started_at_idx ON itap.tracking_sessions (organization_id, started_at DESC);
CREATE INDEX tracking_sessions_organization_id_facility_id_last_location_access_point_id_idx
  ON itap.tracking_sessions (organization_id, facility_id, last_location_access_point_id);
CREATE INDEX tracking_sessions_organization_id_visit_id_idx ON itap.tracking_sessions (organization_id, visit_id);
CREATE INDEX tracking_sessions_organization_id_opened_by_detection_id_idx
  ON itap.tracking_sessions (organization_id, opened_by_detection_id);
-- close_stale_sessions scans the (few) active sessions of an organization.
CREATE INDEX tracking_sessions_active_idx ON itap.tracking_sessions (organization_id) WHERE status = 'active';

CREATE TRIGGER tracking_sessions_set_updated_at BEFORE UPDATE ON itap.tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- Path of an identity: one row per area / access point change (Stage A) or estimated location. detection_id is a
-- log-to-log link without FK (spec §4.1 exception), unique so Stage A is idempotent per detection.
CREATE TABLE itap.identity_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid,
  session_id uuid,
  facility_id uuid,
  area_id uuid,
  access_point_id uuid,
  device_id uuid,
  detection_id uuid,
  -- Point [x, y] in the floor-plan pixel space (the camera position for camera detections).
  position jsonb,
  confidence real,
  movement_type text NOT NULL REFERENCES itap.movement_types (value),
  is_estimated boolean NOT NULL DEFAULT false,
  uncertainty_m real,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_locations_organization_id_detection_id_key UNIQUE (organization_id, detection_id),
  CONSTRAINT identity_locations_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT identity_locations_session_fkey FOREIGN KEY (organization_id, session_id)
    REFERENCES itap.tracking_sessions (organization_id, id) ON DELETE SET NULL (session_id),
  CONSTRAINT identity_locations_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT identity_locations_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE SET NULL (area_id),
  CONSTRAINT identity_locations_access_point_fkey FOREIGN KEY (organization_id, facility_id, access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (access_point_id),
  CONSTRAINT identity_locations_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id) ON DELETE SET NULL (device_id),
  CONSTRAINT identity_locations_position_valid CHECK (position IS NULL OR itap.valid_point(position)),
  CONSTRAINT identity_locations_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT identity_locations_uncertainty_nonnegative CHECK (uncertainty_m IS NULL OR uncertainty_m >= 0)
);

CREATE INDEX identity_locations_organization_id_identity_id_occurred_at_idx
  ON itap.identity_locations (organization_id, identity_id, occurred_at);
CREATE INDEX identity_locations_organization_id_session_id_occurred_at_idx
  ON itap.identity_locations (organization_id, session_id, occurred_at);
CREATE INDEX identity_locations_organization_id_facility_id_area_id_occurred_at_idx
  ON itap.identity_locations (organization_id, facility_id, area_id, occurred_at);
CREATE INDEX identity_locations_organization_id_facility_id_access_point_id_idx
  ON itap.identity_locations (organization_id, facility_id, access_point_id);
-- Required by the generator's FK-index rule (enum FK movement_type); kept although no query filters on it.
CREATE INDEX identity_locations_organization_id_movement_type_idx
  ON itap.identity_locations (organization_id, movement_type);
CREATE INDEX identity_locations_organization_id_device_id_idx ON itap.identity_locations (organization_id, device_id);
CREATE INDEX identity_locations_organization_id_occurred_at_idx
  ON itap.identity_locations (organization_id, occurred_at DESC);

-- Current leaf area of each tracked person per facility (one row per identity and facility). Mutable state written
-- only by SQL; created_at only, entered_at / last_seen_at carry the state. The row is removed when its session
-- closes (Stage A on the next detection after the timeout, or the close_stale_sessions cron); a person who left
-- through an exit, or an identity merged away, therefore stays counted until then.
CREATE TABLE itap.area_occupancy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  area_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  session_id uuid,
  entered_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT area_occupancy_organization_id_facility_id_identity_id_key UNIQUE (organization_id, facility_id, identity_id),
  CONSTRAINT area_occupancy_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT area_occupancy_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT area_occupancy_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT area_occupancy_session_fkey FOREIGN KEY (organization_id, session_id)
    REFERENCES itap.tracking_sessions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT area_occupancy_times_ordered CHECK (last_seen_at >= entered_at)
);

CREATE INDEX area_occupancy_organization_id_facility_id_area_id_idx
  ON itap.area_occupancy (organization_id, facility_id, area_id);
CREATE INDEX area_occupancy_organization_id_identity_id_idx ON itap.area_occupancy (organization_id, identity_id);
CREATE INDEX area_occupancy_organization_id_session_id_idx ON itap.area_occupancy (organization_id, session_id);
