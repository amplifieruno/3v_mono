-- Slice 10 task 1 fix round 1: restricting a person also stops the processing already under way, inside
-- itap.apply_processing_restriction (from its latest definition, 1792365700220):
--   * open manual segment memberships of the profile and of its identities are closed (removed_by = the actor; rule
--     memberships close through the evaluation the profile change requests), and the trigger
--     segment_members_restricted refuses new memberships of a restricted subject (subject_restricted);
--   * open tracking sessions of its identities are closed (itap.close_tracking_session: ended at the last detection).
-- The transaction-local itap.restriction_context is restored to its previous value (a caller such as the DSR job may
-- hold it). Lock order: the identities' tracking advisory locks first (detection writers take them before their FK
-- checks lock the profile), then the profile row, then subjects (identities FOR KEY SHARE) -> segments (id order)
-- -> member rows, then sessions.
CREATE OR REPLACE FUNCTION itap.apply_processing_restriction(p_org uuid, p_profile uuid, p_restricted boolean, p_reason text, p_actor uuid)
RETURNS itap.profiles
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  prof itap.profiles;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  prev_context text := current_setting('itap.restriction_context', true);
  ids uuid[];
  x uuid;
BEGIN
  IF p_restricted IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_state_required');
  END IF;
  IF p_restricted THEN
    FOR x IN SELECT i.id FROM itap.identities i WHERE i.organization_id = p_org AND i.profile_id = p_profile ORDER BY i.id LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || x::text, 0));
    END LOOP;
  END IF;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = p_profile FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('profile_not_found');
  END IF;
  IF reason IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_reason_required');
  END IF;
  IF prof.processing_restricted = p_restricted THEN
    RETURN prof;
  END IF;
  PERFORM set_config('itap.restriction_context', 'on', true);
  UPDATE itap.profiles p SET
    processing_restricted = p_restricted,
    restricted_at = CASE WHEN p_restricted THEN now() END,
    restricted_by = CASE WHEN p_restricted THEN p_actor END,
    restriction_reason = CASE WHEN p_restricted THEN reason END
  WHERE p.organization_id = p_org AND p.id = p_profile
  RETURNING * INTO prof;
  PERFORM set_config('itap.restriction_context', coalesce(prev_context, ''), true);

  IF p_restricted THEN
    -- Links are frozen from here on (identities_restricted_link).
    ids := ARRAY(SELECT i.id FROM itap.identities i WHERE i.organization_id = p_org AND i.profile_id = p_profile ORDER BY i.id);
    PERFORM 1 FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ANY (ids) ORDER BY i.id FOR KEY SHARE;
    PERFORM 1 FROM itap.segments s
    WHERE s.organization_id = p_org AND s.id IN (
      SELECT m.segment_id FROM itap.segment_members m
      WHERE m.organization_id = p_org AND m.removed_at IS NULL AND m.source = 'manual'
        AND (m.profile_id = p_profile OR m.identity_id = ANY (ids)))
    ORDER BY s.id FOR UPDATE;
    UPDATE itap.segment_members m SET removed_at = greatest(now(), m.added_at), removed_by = p_actor
    WHERE m.organization_id = p_org AND m.removed_at IS NULL AND m.source = 'manual'
      AND (m.profile_id = p_profile OR m.identity_id = ANY (ids));
    FOR x IN
      SELECT s.id FROM itap.tracking_sessions s
      WHERE s.organization_id = p_org AND s.identity_id = ANY (ids) AND s.status = 'active' ORDER BY s.id
    LOOP
      PERFORM itap.close_tracking_session(p_org, x);
    END LOOP;
  END IF;

  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (p_org, p_actor, CASE WHEN p_restricted THEN 'restrict' ELSE 'unrestrict' END, 'profiles', p_profile,
          jsonb_build_object('processing_restricted', p_restricted), reason);
  RETURN prof;
END;
$$;

CREATE FUNCTION itap.segment_members_restricted() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM itap.profiles p
    WHERE p.organization_id = NEW.organization_id AND p.processing_restricted
      AND p.id = coalesce(NEW.profile_id, (
        SELECT i.profile_id FROM itap.identities i WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id))
  ) THEN
    PERFORM itap.raise_code('subject_restricted');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER segment_members_restricted BEFORE INSERT ON itap.segment_members
  FOR EACH ROW EXECUTE FUNCTION itap.segment_members_restricted();
