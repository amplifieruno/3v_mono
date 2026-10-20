-- Slice 10 task 1 fix round 1: integrations.secret is stored only encrypted (AES-256-GCM `v2:<iv>:<tag>:<ct>`, the
-- integration id as additional data, server key AUTH_KEY_ENCRYPTION_KEY), written by the backend action
-- set_integration_secret (org_admin; no GraphQL write permission). Status `error` belongs to the system (sync job):
-- non-admin roles cannot set it, but may edit an integration that is in error (status unchanged) or move it to
-- active / paused. (Plaintext secrets of the previous schema are cleared.)
UPDATE itap.integrations SET secret = NULL WHERE secret IS NOT NULL AND secret !~ '^v2:';
ALTER TABLE itap.integrations ADD CONSTRAINT integrations_secret_encrypted
  CHECK (secret IS NULL OR secret ~ '^v2:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$');

CREATE FUNCTION itap.integrations_status_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  role text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-role';
BEGIN
  IF role IS NOT NULL AND role <> 'admin' AND NEW.status = 'error'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'error') THEN
    PERFORM itap.raise_code('integration_status_system_only');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER integrations_status_guard BEFORE INSERT OR UPDATE OF status ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.integrations_status_guard();
