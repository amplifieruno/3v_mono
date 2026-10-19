-- Generic BEFORE INSERT trigger: fills a member column (added_by, author_id, from_user_id) with the Hasura session
-- user when the column is NULL and that user is a member of the row's organization. The column is read-only in
-- metadata, so org_admin cannot spoof it; the admin secret (seed, backend `actor`) may set it explicitly.
-- Usage: EXECUTE FUNCTION itap.stamp_session_member('<column>'). Unknown column arguments raise undefined_column.
CREATE FUNCTION itap.stamp_session_member() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  col text := TG_ARGV[0];
  session_user_id text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id';
BEGIN
  IF col IS NULL OR NOT (to_jsonb(NEW) ? col) THEN
    RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'stamp_session_member: unknown column ' || coalesce(col, '<none>');
  END IF;
  IF to_jsonb(NEW) ->> col IS NULL
     AND session_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1 FROM itap.organization_members m
       WHERE m.organization_id = NEW.organization_id AND m.user_id = session_user_id::uuid
     )
  THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(col, session_user_id));
  END IF;
  RETURN NEW;
END;
$$;
