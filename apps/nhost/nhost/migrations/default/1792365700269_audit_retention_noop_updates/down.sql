-- Restores audit_row_change auditing every retention-context update.
CREATE OR REPLACE FUNCTION itap.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  old_row jsonb;
  new_row jsonb;
  row_data jsonb;
  redacted text[] := '{}';
  ignored text[] := ARRAY['updated_at'];
  arg text;
  i int;
  col text;
  org_id uuid;
  changes jsonb := '{}'::jsonb;
  action_name text := lower(TG_OP);
  sess json := NULLIF(current_setting('hasura.user', true), '')::json;
  actor text := sess ->> 'x-hasura-user-id';
  -- A synthetic actor (e.g. integration:INT-00001 for the HR sync): only admin-secret sessions can set it.
  audit_reason text := CASE WHEN sess ->> 'x-hasura-role' = 'admin'
                            THEN left(nullif(btrim(sess ->> 'x-hasura-audit-reason'), ''), 200) END;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    arg := TG_ARGV[i];
    IF arg LIKE 'ignore:%' THEN
      ignored := ignored || substr(arg, 8);
    ELSE
      redacted := redacted || arg;
    END IF;
  END LOOP;

  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  row_data := COALESCE(new_row, old_row);

  IF TG_TABLE_NAME = 'organizations' THEN
    org_id := (row_data ->> 'id')::uuid;
  ELSE
    org_id := (row_data ->> 'organization_id')::uuid;
    -- Organization already deleted: this is a cascade, nothing left to audit.
    IF NOT EXISTS (SELECT 1 FROM itap.organizations WHERE id = org_id) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Retention / erasure (itap.retention_context): record that the row was purged, never its old or new values.
  IF itap.retention_context() THEN
    INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
    VALUES (
      org_id,
      CASE WHEN actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN actor::uuid END,
      action_name,
      TG_TABLE_NAME,
      COALESCE((row_data ->> 'id')::uuid, (row_data ->> 'organization_id')::uuid),
      '{"retention": true}'::jsonb,
      audit_reason
    );
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR col IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN col = ANY (ignored);
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        changes := changes || jsonb_build_object(
          col,
          jsonb_build_object(
            'old', CASE WHEN col = ANY (redacted) THEN to_jsonb('[redacted]'::text) ELSE old_row -> col END,
            'new', CASE WHEN col = ANY (redacted) THEN to_jsonb('[redacted]'::text) ELSE new_row -> col END
          )
        );
      END IF;
    END LOOP;
    IF changes = '{}'::jsonb THEN RETURN NULL; END IF;
  ELSE
    FOREACH col IN ARRAY redacted LOOP
      IF row_data ? col THEN
        row_data := jsonb_set(row_data, ARRAY[col], to_jsonb('[redacted]'::text));
      END IF;
    END LOOP;
    changes := row_data;
  END IF;

  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (
    org_id,
    CASE WHEN actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN actor::uuid END,
    action_name,
    TG_TABLE_NAME,
    COALESCE((row_data ->> 'id')::uuid, (row_data ->> 'organization_id')::uuid),
    changes,
    audit_reason
  );
  RETURN NULL;
END;
$function$
;
