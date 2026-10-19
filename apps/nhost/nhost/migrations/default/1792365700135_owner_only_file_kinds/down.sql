CREATE OR REPLACE FUNCTION itap.check_file_bucket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  file_bucket text;
  file_kind text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT (to_jsonb(NEW) ? col) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'check_file_bucket: unknown column ' || col;
    END IF;
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    IF TG_OP = 'UPDATE' THEN
      old_value := (to_jsonb(OLD) ->> col)::uuid;
    ELSE
      old_value := NULL;
    END IF;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT f.bucket_id, f.metadata ->> 'kind' INTO file_bucket, file_kind FROM storage.files f WHERE f.id = new_value;
      IF NOT FOUND OR file_bucket IS DISTINCT FROM NEW.organization_id::text THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_not_in_org_bucket:' || col;
      END IF;
      IF file_kind = 'search' THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_owner_only:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.search_definition_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_owner uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  f record;
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.filters IS DISTINCT FROM OLD.filters)
     AND NOT itap.search_filter_refs(NEW.organization_id, NEW.filters) THEN
    PERFORM itap.raise_code('search_filters_invalid');
  END IF;
  IF NEW.image_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.image_file_id IS DISTINCT FROM OLD.image_file_id) THEN
    SELECT fl.bucket_id, fl.uploaded_by_user_id, fl.metadata ->> 'kind' AS kind INTO f
    FROM storage.files fl WHERE fl.id = NEW.image_file_id;
    IF NOT FOUND OR f.bucket_id IS DISTINCT FROM NEW.organization_id::text
       OR f.kind IN ('profile_document', 'dsr_export', 'auth_capture')
       OR (f.kind = 'search' AND f.uploaded_by_user_id IS DISTINCT FROM v_owner) THEN
      PERFORM itap.raise_code('search_image_not_found');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION itap.owner_only_file_kinds();
