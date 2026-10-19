-- Restores check_access of migration 161 and drops the reason value.
CREATE OR REPLACE FUNCTION itap.check_access(
  hasura_session json,
  access_point_id uuid,
  identity_id uuid DEFAULT NULL,
  profile_id uuid DEFAULT NULL,
  device_id uuid DEFAULT NULL
) RETURNS SETOF itap.access_decisions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  r itap.access_evaluation;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM itap.organization_members m
    WHERE m.organization_id = org AND m.user_id = itap.session_user_id(hasura_session)
      AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())
  ) THEN
    PERFORM itap.raise_code('member_required');
  END IF;
  r := itap.evaluate_access(org, $2, $3, $4, $5, now(), true);
  RETURN QUERY SELECT * FROM itap.access_decisions d WHERE d.organization_id = org AND d.id = r.decision_id;
END;
$$;

DELETE FROM itap.access_decision_reasons WHERE value = 'access_point_unavailable';
