-- A floor plan image must be an image file (storage.files.mime_type image/*); raises floor_plan_not_image.
-- Checked on insert and when image_file_id changes; a missing file is left to the FK to report.
CREATE FUNCTION itap.floor_plans_check_image() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  file_mime text;
BEGIN
  IF NEW.image_file_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.image_file_id IS NOT DISTINCT FROM OLD.image_file_id) THEN
    RETURN NEW;
  END IF;
  SELECT f.mime_type INTO file_mime FROM storage.files f WHERE f.id = NEW.image_file_id;
  IF FOUND AND (file_mime IS NULL OR file_mime NOT LIKE 'image/%') THEN
    PERFORM itap.raise_code('floor_plan_not_image');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER floor_plans_check_image BEFORE INSERT OR UPDATE OF image_file_id ON itap.floor_plans
  FOR EACH ROW EXECUTE FUNCTION itap.floor_plans_check_image();
