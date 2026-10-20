DROP FUNCTION itap.store_client_key(json, uuid, text, text, text, timestamptz);

-- Admin only (called by the backend action rotate_client_key with the caller's session): stores a new key for an
-- application of the session organization. The caller must be an active member; the application must not be
-- revoked; at most two active (not revoked, not expired) keys per application.
CREATE FUNCTION itap.store_client_key(
  hasura_session json,
  p_application uuid,
  p_key_prefix text,
  p_secret_hash text,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS SETOF itap.client_application_keys
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  app_status text;
  new_id uuid;
BEGIN
  SELECT status INTO app_status FROM itap.client_applications
  WHERE organization_id = org AND id = p_application FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF app_status = 'revoked' THEN
    PERFORM itap.raise_code('client_application_revoked');
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    PERFORM itap.raise_code('client_key_expiry_invalid');
  END IF;
  IF (SELECT count(*) FROM itap.client_application_keys k
      WHERE k.organization_id = org AND k.application_id = p_application
        AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())) >= 2 THEN
    PERFORM itap.raise_code('client_key_limit');
  END IF;
  INSERT INTO itap.client_application_keys (organization_id, application_id, key_prefix, secret_hash, created_by, expires_at)
  VALUES (org, p_application, p_key_prefix, p_secret_hash, actor, p_expires_at)
  RETURNING id INTO new_id;
  RETURN QUERY SELECT * FROM itap.client_application_keys WHERE id = new_id;
END;
$$;

DROP TRIGGER audit ON itap.client_application_keys;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_keys
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret_hash', 'ignore:last_used_at');

ALTER TABLE itap.client_application_keys DROP CONSTRAINT client_application_keys_secret_format;
ALTER TABLE itap.client_application_keys DROP COLUMN secret;
