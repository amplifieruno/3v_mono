-- Visit mutations (spec §6.2), tracked for org_admin, session organization only (a foreign id raises
-- visit_not_found). Transitions are validated by visits_validate_transition; user actions, so now() is the clock.
--   check_in_visit(visit, badge_number)   scheduled -> checked_in, checked_in_at = now()
--   check_out_visit(visit)                checked_in -> checked_out, checked_out_at = now()
--   cancel_visit(visit, reason)           scheduled -> cancelled
CREATE FUNCTION itap.lock_visit(p_organization_id uuid, p_visit uuid) RETURNS itap.visits
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  visit itap.visits;
BEGIN
  SELECT * INTO visit FROM itap.visits WHERE organization_id = p_organization_id AND id = p_visit FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('visit_not_found');
  END IF;
  RETURN visit;
END;
$$;

CREATE FUNCTION itap.check_in_visit(hasura_session json, p_visit uuid, p_badge_number text DEFAULT NULL)
RETURNS SETOF itap.visits
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  visit itap.visits := itap.lock_visit(org, p_visit);
BEGIN
  IF visit.status <> 'scheduled' THEN
    PERFORM itap.raise_code('visit_invalid_transition');
  END IF;
  UPDATE itap.visits
  SET status = 'checked_in', checked_in_at = now(), badge_number = coalesce(p_badge_number, badge_number)
  WHERE organization_id = org AND id = p_visit;
  RETURN QUERY SELECT * FROM itap.visits WHERE organization_id = org AND id = p_visit;
END;
$$;

CREATE FUNCTION itap.check_out_visit(hasura_session json, p_visit uuid)
RETURNS SETOF itap.visits
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  visit itap.visits := itap.lock_visit(org, p_visit);
BEGIN
  IF visit.status <> 'checked_in' THEN
    PERFORM itap.raise_code('visit_invalid_transition');
  END IF;
  UPDATE itap.visits SET status = 'checked_out', checked_out_at = now()
  WHERE organization_id = org AND id = p_visit;
  RETURN QUERY SELECT * FROM itap.visits WHERE organization_id = org AND id = p_visit;
END;
$$;

CREATE FUNCTION itap.cancel_visit(hasura_session json, p_visit uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.visits
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  visit itap.visits := itap.lock_visit(org, p_visit);
BEGIN
  IF visit.status <> 'scheduled' THEN
    PERFORM itap.raise_code('visit_invalid_transition');
  END IF;
  UPDATE itap.visits SET status = 'cancelled', cancellation_reason = p_reason
  WHERE organization_id = org AND id = p_visit;
  RETURN QUERY SELECT * FROM itap.visits WHERE organization_id = org AND id = p_visit;
END;
$$;
