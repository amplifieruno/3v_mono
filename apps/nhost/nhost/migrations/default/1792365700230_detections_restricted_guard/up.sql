-- Slice 10 task 1 fix round 1, Stage A backstop: a detection naming an identity of a restricted profile is refused
-- (subject_restricted), so no tracking state, event or access decision is derived for the person. Recognition never
-- gets here (it drops such faces through itap.match_face_suppressed); this covers every other writer. Runs after
-- detections_derive (name order), i.e. after the identity advisory lock.
CREATE FUNCTION itap.detections_restricted() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.identity_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.identities i
    JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id AND p.processing_restricted
  ) THEN
    PERFORM itap.raise_code('subject_restricted');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER detections_restricted BEFORE INSERT ON itap.detections
  FOR EACH ROW EXECUTE FUNCTION itap.detections_restricted();
