-- Restores the previous active_member_check (no column guard, expires_at ignored).
CREATE OR REPLACE FUNCTION itap.active_member_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  member_status text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    IF TG_OP = 'UPDATE' THEN
      old_value := (to_jsonb(OLD) ->> col)::uuid;
    ELSE
      old_value := NULL;
    END IF;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT m.status INTO member_status
      FROM itap.organization_members m
      WHERE m.organization_id = NEW.organization_id AND m.user_id = new_value;
      IF FOUND AND member_status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'member_not_active:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
