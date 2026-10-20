CREATE OR REPLACE FUNCTION itap.retention_attempt_held(s itap.retention_scope, p_attempt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT p_attempt IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = (s).organization_id AND a.id = p_attempt
      AND (itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)));
$function$

;

CREATE OR REPLACE FUNCTION itap.retention_candidates_auth_attempts(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a.id, itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false))
    AND ((s).action = 'delete' OR a.matched_identity_id IS NOT NULL OR a.claimed_identity_id IS NOT NULL
         OR a.profile_id IS NOT NULL OR a.ip IS NOT NULL OR a.user_agent IS NOT NULL OR a.device_ref IS NOT NULL
         OR a.confidence IS NOT NULL OR a.comparison_score IS NOT NULL OR a.evidence_file_id IS NOT NULL
         OR a.review_note IS NOT NULL OR a.sequence_digest IS NOT NULL OR a.attack_details <> '{}'::jsonb
         OR a.quality <> '{}'::jsonb);
$function$

;

CREATE OR REPLACE FUNCTION itap.retention_candidates_auth_evidence(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a.id, itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff AND a.evidence_file_id IS NOT NULL
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false));
$function$

;

CREATE OR REPLACE FUNCTION itap.event_personal_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY['claimed_identity_id', 'matched_identity_id', 'confidence', 'session_id', 'reviewed_by', 'started_by',
    'ended_by', 'grant_id', 'profile_status', 'profile_type', 'clearance', 'people', 'justification'];
$function$

;

DROP FUNCTION itap.retention_attempt_row_held(itap.retention_scope, itap.authentication_attempts);
