-- Slice 10 task 3 (carry from the task 2 review): face-authentication attempts are also held
--  * at an access point of a held facility (the attempt is door evidence there), and
--  * when an event recording the attempt is linked to a held incident;
-- one row predicate itap.retention_attempt_row_held(scope, attempt) used by the auth_attempts / auth_evidence
-- candidates and by retention_attempt_held (events held through their attempt). Tailgating payloads list the
-- decisions of the people who passed: `decisions` joins the personal payload keys stripped on anonymization / erasure.

CREATE FUNCTION itap.retention_attempt_row_held(s itap.retention_scope, a itap.authentication_attempts) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
    OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)
    OR (a.access_point_id IS NOT NULL AND cardinality((s).held_facilities) > 0 AND EXISTS (
          SELECT 1 FROM itap.access_points p WHERE p.organization_id = a.organization_id AND p.id = a.access_point_id
            AND p.facility_id = ANY ((s).held_facilities)))
    OR (cardinality((s).held_incidents) > 0 AND EXISTS (
          SELECT 1 FROM itap.events e
          JOIN itap.incident_events ie ON ie.organization_id = e.organization_id AND ie.event_id = e.id
          WHERE e.organization_id = a.organization_id AND e.authentication_attempt_id = a.id
            AND ie.incident_id = ANY ((s).held_incidents)));
$$;

CREATE OR REPLACE FUNCTION itap.retention_attempt_held(s itap.retention_scope, p_attempt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT p_attempt IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = (s).organization_id AND a.id = p_attempt
      AND itap.retention_attempt_row_held(s, a));
$function$;

CREATE OR REPLACE FUNCTION itap.retention_candidates_auth_attempts(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a.id, itap.retention_attempt_row_held(s, a)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false))
    AND ((s).action = 'delete' OR a.matched_identity_id IS NOT NULL OR a.claimed_identity_id IS NOT NULL
         OR a.profile_id IS NOT NULL OR a.ip IS NOT NULL OR a.user_agent IS NOT NULL OR a.device_ref IS NOT NULL
         OR a.confidence IS NOT NULL OR a.comparison_score IS NOT NULL OR a.evidence_file_id IS NOT NULL
         OR a.review_note IS NOT NULL OR a.sequence_digest IS NOT NULL OR a.attack_details <> '{}'::jsonb
         OR a.quality <> '{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION itap.retention_candidates_auth_evidence(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a.id, itap.retention_attempt_row_held(s, a)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff AND a.evidence_file_id IS NOT NULL
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false));
$function$;

CREATE OR REPLACE FUNCTION itap.event_personal_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY['claimed_identity_id', 'matched_identity_id', 'confidence', 'session_id', 'reviewed_by', 'started_by',
    'ended_by', 'grant_id', 'profile_status', 'profile_type', 'clearance', 'people', 'justification', 'decisions'];
$function$;
