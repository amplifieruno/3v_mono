-- Detections (spec §6.8): one row per recognised (or unrecognised) face in a frame. Append-only, written by the
-- recognition pipeline (backend, admin secret) only: read-only for org_admin, not audited (high volume, spec §8.1),
-- created_at only. Logs keep their row when a referenced entity goes away: every FK is ON DELETE SET NULL (col)
-- (spec §6.0), organization_id is never nulled.
--
-- Derivation (BEFORE INSERT, itap.detections_derive): device_id is required; facility_id is always the device's
-- facility (an explicit different facility is rejected), area_id defaults to the device's primary area and
-- access_point_id to the access point the device is bound to as a camera (access_point_devices, role camera; the
-- oldest binding when there are several). The device FK is two-column so the device timeline index
-- (organization_id, device_id, detected_at) covers it; facility consistency of the device is guaranteed by the
-- derivation, of the area and access point by same-facility FKs. The derivation also takes the per-identity
-- advisory lock (see below) so that Stage A runs serialized per identity.
CREATE TABLE itap.detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  device_id uuid,
  facility_id uuid,
  area_id uuid,
  access_point_id uuid,
  -- NULL = face not matched and no identity created for it.
  identity_id uuid,
  confidence real,
  similarity real,
  is_new_identity boolean NOT NULL DEFAULT false,
  -- Face box in frame pixels: {"x", "y", "width", "height"} (numbers).
  bbox jsonb,
  frame_width integer,
  frame_height integer,
  quality_score real,
  thumbnail_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detections_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id) ON DELETE SET NULL (device_id),
  CONSTRAINT detections_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT detections_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE SET NULL (area_id),
  CONSTRAINT detections_access_point_fkey FOREIGN KEY (organization_id, facility_id, access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (access_point_id),
  CONSTRAINT detections_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT detections_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT detections_similarity_range CHECK (similarity IS NULL OR similarity BETWEEN -1 AND 1),
  CONSTRAINT detections_quality_range CHECK (quality_score IS NULL OR quality_score >= 0),
  CONSTRAINT detections_frame_positive CHECK (
    (frame_width IS NULL OR frame_width > 0) AND (frame_height IS NULL OR frame_height > 0)
  ),
  CONSTRAINT detections_bbox_valid CHECK (
    bbox IS NULL OR (
      jsonb_typeof(bbox) = 'object'
      AND jsonb_typeof(bbox -> 'x') = 'number' AND jsonb_typeof(bbox -> 'y') = 'number'
      AND jsonb_typeof(bbox -> 'width') = 'number' AND jsonb_typeof(bbox -> 'height') = 'number'
    )
  )
);

CREATE INDEX detections_organization_id_detected_at_idx ON itap.detections (organization_id, detected_at DESC);
CREATE INDEX detections_organization_id_identity_id_detected_at_idx
  ON itap.detections (organization_id, identity_id, detected_at);
CREATE INDEX detections_organization_id_device_id_detected_at_idx
  ON itap.detections (organization_id, device_id, detected_at);
CREATE INDEX detections_organization_id_facility_id_area_id_idx ON itap.detections (organization_id, facility_id, area_id);
CREATE INDEX detections_organization_id_facility_id_access_point_id_idx
  ON itap.detections (organization_id, facility_id, access_point_id);
-- FK-covering index required by the tenant FK rule (organization_id leading); the partial single-column index
-- serves the storage.files ON DELETE SET NULL lookup (most detections have no thumbnail).
CREATE INDEX detections_organization_id_thumbnail_file_id_idx ON itap.detections (organization_id, thumbnail_file_id);
CREATE INDEX detections_thumbnail_file_id_idx ON itap.detections (thumbnail_file_id) WHERE thumbnail_file_id IS NOT NULL;

CREATE FUNCTION itap.detections_derive() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  device_facility uuid;
  device_area uuid;
BEGIN
  IF NEW.device_id IS NULL THEN
    PERFORM itap.raise_code('detection_device_required');
  END IF;
  SELECT d.facility_id, d.area_id INTO device_facility, device_area
  FROM itap.devices d
  WHERE d.organization_id = NEW.organization_id AND d.id = NEW.device_id;
  IF NOT FOUND THEN
    -- Left to detections_device_fkey to report.
    RETURN NEW;
  END IF;
  IF NEW.facility_id IS NOT NULL AND NEW.facility_id <> device_facility THEN
    PERFORM itap.raise_code('detection_facility_mismatch');
  END IF;
  NEW.facility_id := device_facility;
  IF NEW.access_point_id IS NULL THEN
    SELECT b.access_point_id INTO NEW.access_point_id
    FROM itap.access_point_devices b
    WHERE b.organization_id = NEW.organization_id AND b.facility_id = device_facility
      AND b.device_id = NEW.device_id AND b.role = 'camera'
    ORDER BY b.created_at, b.id
    LIMIT 1;
  END IF;
  NEW.area_id := coalesce(NEW.area_id, device_area);
  -- Serializes Stage A (itap.track_detection) per identity with a transaction-level advisory lock on
  -- 'identity:<id>'. It must be taken here, before the FK check of detections_identity_fkey takes its KEY SHARE lock
  -- on the identity row: Stage A updates the identity, and an identity UPDATE counts as a key update in PG16 (the
  -- stored generated `code` column of the unique key is recomputed), so it waits for KEY SHARE locks of other
  -- transactions. A lock taken in the AFTER trigger deadlocked two concurrent detections of one identity (each held
  -- KEY SHARE and waited for the other); here a second insert waits before it holds any lock on the identity.
  -- Every other writer of an identity's tracking state (close_stale_sessions) takes the same advisory lock first.
  IF NEW.identity_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || NEW.identity_id::text, 0));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER detections_derive BEFORE INSERT ON itap.detections
  FOR EACH ROW EXECUTE FUNCTION itap.detections_derive();
CREATE TRIGGER detections_check_files BEFORE INSERT ON itap.detections
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('thumbnail_file_id');
