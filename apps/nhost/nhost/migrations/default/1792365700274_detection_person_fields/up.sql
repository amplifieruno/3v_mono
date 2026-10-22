-- Detections carry the identity, not the person. Computed fields for the console (read by org_admin through the
-- detections select permission):
-- * profile_id: the profile the detection's identity is linked to now (a detection of an unknown identity: NULL),
--   so a person's detections can be listed and detections filtered by known / unknown;
-- * person_erased: that profile was erased on request (a tombstone: "Erased subject"), so the console shows
--   "erased" instead of the tombstone's code and a deleted face photo.
CREATE FUNCTION itap.detection_profile_id(detection_row itap.detections) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT i.profile_id FROM itap.identities i
  WHERE i.organization_id = detection_row.organization_id AND i.id = detection_row.identity_id;
$$;

CREATE FUNCTION itap.detection_person_erased(detection_row itap.detections) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce((
    SELECT p.erased_at IS NOT NULL FROM itap.identities i
    JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE i.organization_id = detection_row.organization_id AND i.id = detection_row.identity_id), false);
$$;
