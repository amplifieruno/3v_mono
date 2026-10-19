-- Restores the previous accept_invitation (no renewal of an expired active membership).
CREATE OR REPLACE FUNCTION itap.accept_invitation(p_token_hash text, p_user_id uuid, p_email citext)
RETURNS SETOF itap.organization_invitations
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
AS $$
DECLARE
  inv itap.organization_invitations;
  member_id uuid;
BEGIN
  SELECT * INTO inv FROM itap.organization_invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF inv.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;
  IF inv.email <> p_email THEN RAISE EXCEPTION 'email_mismatch'; END IF;

  -- Creates the membership, or reactivates a non-active one (the deactivation trigger clears its fields).
  INSERT INTO itap.organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, p_user_id, inv.role)
  ON CONFLICT (organization_id, user_id)
    DO UPDATE SET status = 'active', role = EXCLUDED.role
    WHERE itap.organization_members.status <> 'active'
  RETURNING id INTO member_id;
  IF member_id IS NULL THEN RAISE EXCEPTION 'already_member'; END IF;

  RETURN QUERY
    UPDATE itap.organization_invitations
    SET status = 'accepted', accepted_by = p_user_id, accepted_at = now()
    WHERE id = inv.id
    RETURNING *;
END;
$$;
