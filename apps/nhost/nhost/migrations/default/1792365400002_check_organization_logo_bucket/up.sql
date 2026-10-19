-- organizations.logo_file_id must reference a file in the shared `org-logos` bucket (never a file from an
-- organization bucket, which may hold sensitive documents). Checked on insert and when the column changes.
CREATE FUNCTION itap.check_organization_logo_bucket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.logo_file_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.logo_file_id IS DISTINCT FROM OLD.logo_file_id)
     AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = NEW.logo_file_id AND f.bucket_id = 'org-logos') THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_not_in_org_logos:logo_file_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_check_logo_bucket
  BEFORE INSERT OR UPDATE OF logo_file_id ON itap.organizations
  FOR EACH ROW EXECUTE FUNCTION itap.check_organization_logo_bucket();
