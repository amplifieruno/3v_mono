-- Restores itap.auth_open_session as before 1792365700210 (access point optional for every application).
CREATE OR REPLACE FUNCTION itap.auth_open_session(p_org uuid, p_app uuid, p_key uuid, p_session uuid, p_mode text, p_claimed_identity uuid, p_claimed_ref_hash text, p_access_point uuid, p_device_ref text, p_nonce_hash text, p_ip text, p_user_agent text)
 RETURNS SETOF itap.authentication_sessions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  app itap.client_applications;
  known uuid;
BEGIN
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF app.status <> 'active' THEN
    PERFORM itap.raise_code('client_application_inactive');
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('identification', 'verification') THEN
    PERFORM itap.raise_code('auth_mode_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.client_application_modes m
                 WHERE m.organization_id = p_org AND m.application_id = p_app AND m.mode = p_mode) THEN
    PERFORM itap.raise_code('auth_mode_not_allowed');
  END IF;
  IF p_mode = 'identification' AND (p_claimed_identity IS NOT NULL OR p_claimed_ref_hash IS NOT NULL) THEN
    PERFORM itap.raise_code('auth_claimed_identity_not_allowed');
  END IF;
  IF p_mode = 'verification' AND (p_claimed_identity IS NULL OR p_claimed_ref_hash IS NULL) THEN
    PERFORM itap.raise_code('auth_claimed_identity_required');
  END IF;
  IF p_access_point IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.client_application_access_points b
    WHERE b.organization_id = p_org AND b.application_id = p_app AND b.access_point_id = p_access_point
  ) THEN
    PERFORM itap.raise_code('access_point_not_bound');
  END IF;
  IF p_device_ref IS NULL OR btrim(p_device_ref) = '' OR length(p_device_ref) > 128 THEN
    PERFORM itap.raise_code('auth_device_ref_invalid');
  END IF;
  -- The FK only for an id of this organization (the hash binds the claim either way; no existence oracle here).
  SELECT i.id INTO known FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_claimed_identity;
  RETURN QUERY
  INSERT INTO itap.authentication_sessions (
    id, organization_id, application_id, key_id, mode, claimed_identity_id, claimed_ref_hash, access_point_id,
    device_ref, nonce_hash, expires_at, created_ip, user_agent, created_at
  ) VALUES (
    p_session, p_org, p_app, p_key, p_mode, known, p_claimed_ref_hash, p_access_point, p_device_ref, p_nonce_hash,
    itap.auth_now() + interval '5 minutes', nullif(p_ip, '')::inet, left(p_user_agent, 512), itap.auth_now()
  )
  RETURNING *;
END;
$function$
;
