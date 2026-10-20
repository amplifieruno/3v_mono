-- Restores the guard and revoke_client_key as before 1792365700211 (revocation keeps the ciphertext). Secrets
-- cleared by the up migration are not restored (revoked keys never authenticate).
CREATE OR REPLACE FUNCTION itap.guard_client_application_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  in_revoke boolean := coalesce(current_setting('itap.client_key_context', true), '') = 'on';
  free text[] := ARRAY['revoked_at', 'revoked_by', 'last_used_at', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.last_used_at IS NOT NULL THEN
      PERFORM itap.raise_code('client_key_not_editable');
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - free) IS DISTINCT FROM (to_jsonb(OLD) - free)
     OR ((NEW.revoked_at, NEW.revoked_by) IS DISTINCT FROM (OLD.revoked_at, OLD.revoked_by)
         AND (NOT in_revoke OR OLD.revoked_at IS NOT NULL)) THEN
    PERFORM itap.raise_code('client_key_not_editable');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.revoke_client_key(hasura_session json, p_key uuid)
 RETURNS SETOF itap.client_application_keys
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  revoked timestamptz;
BEGIN
  SELECT revoked_at INTO revoked FROM itap.client_application_keys WHERE organization_id = org AND id = p_key FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_key_not_found');
  END IF;
  IF revoked IS NOT NULL THEN
    PERFORM itap.raise_code('client_key_revoked');
  END IF;
  PERFORM set_config('itap.client_key_context', 'on', true);
  UPDATE itap.client_application_keys SET revoked_at = now(), revoked_by = actor WHERE organization_id = org AND id = p_key;
  PERFORM set_config('itap.client_key_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.client_application_keys WHERE organization_id = org AND id = p_key;
END;
$function$
;
