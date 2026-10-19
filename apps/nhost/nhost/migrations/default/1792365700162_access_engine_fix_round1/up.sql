-- Access engine fix round 1 (slice 8 task 2 review):
-- * life safety: an active evacuation opens exits (direction out/both) even when a lock_all also covers the access
--   point; entries stay locked;
-- * identity-target segment subjects match through every identity of the person: the presented one and all
--   identities linked to the profile, resolved to effective identities, membership open at `at`;
-- * single-use consumption re-checks revocation in the UPDATE (a concurrent revoke wins);
-- * the policy epoch is read at the start of the evaluation (also in the trace);
-- * a device not bound to the access point is ignored (trace signals.ignored_device_id, decision device_id NULL);
--   check_access raises invalid_device;
-- (evaluate_access is replaced in *_evaluate_access_fix_round1; this migration: enum value + check_access)
-- * trace grants: `applied` (was `used`);
-- * an access point with status inactive / maintenance -> denied access_point_unavailable (after overrides).

INSERT INTO itap.access_decision_reasons (value, description)
VALUES ('access_point_unavailable', 'The access point is inactive or under maintenance');

-- Tracked mutation (org_admin, active member; terminals / demo): evaluates at now() only (no
-- caller-supplied time) and records the decision.
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
  -- A presented device must be bound to the access point (evaluate_access alone would only ignore it).
  IF $5 IS NOT NULL AND EXISTS (SELECT 1 FROM itap.devices d WHERE d.organization_id = org AND d.id = $5)
     AND NOT EXISTS (SELECT 1 FROM itap.access_point_devices apd
                     WHERE apd.organization_id = org AND apd.access_point_id = $2 AND apd.device_id = $5) THEN
    PERFORM itap.raise_code('invalid_device');
  END IF;
  r := itap.evaluate_access(org, $2, $3, $4, $5, now(), true);
  RETURN QUERY SELECT * FROM itap.access_decisions d WHERE d.organization_id = org AND d.id = r.decision_id;
END;
$$;
