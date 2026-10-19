-- active_member_check: fail loudly on a trigger argument that is not a column (same guard as
-- check_file_bucket), and treat a member whose expires_at has passed as not active.
CREATE OR REPLACE FUNCTION itap.active_member_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  member_status text;
  member_expires_at timestamptz;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT (to_jsonb(NEW) ? col) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'active_member_check: unknown column ' || col;
    END IF;
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    IF TG_OP = 'UPDATE' THEN
      old_value := (to_jsonb(OLD) ->> col)::uuid;
    ELSE
      old_value := NULL;
    END IF;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT m.status, m.expires_at INTO member_status, member_expires_at
      FROM itap.organization_members m
      WHERE m.organization_id = NEW.organization_id AND m.user_id = new_value;
      IF FOUND AND (member_status <> 'active' OR member_expires_at <= now()) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'member_not_active:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
