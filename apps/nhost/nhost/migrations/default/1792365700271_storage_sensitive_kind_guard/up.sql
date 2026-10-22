-- Sensitive file kinds (`profile_document`, `dsr_export`, `auth_capture`, `export`) are created only by backend
-- actions, which upload through hasura-storage with the admin secret (design §4.4, bd 3v_mono-ryj). The storage.files
-- insert permission cannot enforce it: hasura-storage 0.7.2 inserts the row with the caller's role and no metadata,
-- then writes `metadata` in a second request with the admin secret. This trigger refuses a sensitive kind when
--   * the write runs under a non-admin Hasura role (a direct insertFile / updateFile), or
--   * metadata changes to a sensitive kind on a row a member uploaded (uploaded_by_user_id is set: org_admin uploads
--     get it from the insert preset; admin-secret uploads have none until the backend sets the owner afterwards,
--     e.g. export files, whose kind is already set by then).
-- Writes without a Hasura session (SQL functions, migrations, the seed's SQL) are not affected.
CREATE FUNCTION itap.sensitive_file_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT ARRAY['profile_document', 'dsr_export', 'auth_capture', 'export'] $$;

CREATE FUNCTION itap.storage_files_sensitive_kind_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_kind text := NEW.metadata ->> 'kind';
  v_role text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-role';
BEGIN
  IF v_kind IS NULL OR NOT (v_kind = ANY (itap.sensitive_file_kinds())) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.metadata ->> 'kind') IS NOT DISTINCT FROM v_kind THEN
    RETURN NEW;
  END IF;
  IF (v_role IS NOT NULL AND v_role <> 'admin')
     OR (TG_OP = 'UPDATE' AND OLD.uploaded_by_user_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_kind_sensitive:' || v_kind;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sensitive_kind_guard
  BEFORE INSERT OR UPDATE OF metadata ON storage.files
  FOR EACH ROW EXECUTE FUNCTION itap.storage_files_sensitive_kind_guard();
