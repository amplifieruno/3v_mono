-- File reference columns must point at a file stored in the row's own organization bucket.
-- Usage: EXECUTE FUNCTION itap.check_file_bucket('col_a', 'col_b', ...) on tables with organization_id.
-- Checked only on insert or when the column changes. Not attached to any table yet (first use in slice 2).
CREATE FUNCTION itap.check_file_bucket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  file_bucket text;
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
      SELECT f.bucket_id INTO file_bucket FROM storage.files f WHERE f.id = new_value;
      IF NOT FOUND OR file_bucket IS DISTINCT FROM NEW.organization_id::text THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_not_in_org_bucket:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
