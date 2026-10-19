-- Detection derivation (Stage A input): access_point_id is derived from the device's camera binding only when the
-- device has exactly one camera binding (before: the oldest of several, which put lobby-lounge detections at a
-- turnstile). Everything else is unchanged from the previous definition.
CREATE OR REPLACE FUNCTION itap.detections_derive() RETURNS trigger
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
  -- Only an unambiguous binding is derived: a camera watching several access points (the lobby camera covers four
  -- turnstiles and the reception desk) cannot tell which one a face passed, so the caller must say or it stays NULL.
  IF NEW.access_point_id IS NULL THEN
    SELECT min(b.access_point_id::text)::uuid INTO NEW.access_point_id
    FROM itap.access_point_devices b
    WHERE b.organization_id = NEW.organization_id AND b.facility_id = device_facility
      AND b.device_id = NEW.device_id AND b.role = 'camera'
    HAVING count(*) = 1;
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
