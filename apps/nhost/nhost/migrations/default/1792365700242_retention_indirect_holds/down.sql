-- Restores the task 2 candidate / event predicates.
CREATE OR REPLACE FUNCTION itap.retention_candidates_events(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT e.id,
         itap.retention_held(s, e.identity_id, e.profile_id, e.facility_id)
           OR EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
                      AND ie.event_id = e.id AND ie.incident_id = ANY ((s).held_incidents))
  FROM itap.events e
  WHERE e.organization_id = (s).organization_id AND e.occurred_at < (s).cutoff
    AND itap.retention_in_facility(s, e.facility_id) AND itap.retention_subject(s, e.identity_id, e.profile_id)
    AND NOT EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
                    AND ie.event_id = e.id AND NOT (ie.incident_id = ANY ((s).held_incidents)))
    AND ((s).action = 'delete' OR NOT (e.payload ? 'anonymized'));
$function$

;
CREATE OR REPLACE FUNCTION itap.retention_event_held(s itap.retention_scope, p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_held(s, e.identity_id, e.profile_id, e.facility_id));
$function$

;
CREATE OR REPLACE FUNCTION itap.retention_event_subject(s itap.retention_scope, p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (s).subject_identities IS NULL OR (p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_subject(s, e.identity_id, e.profile_id)));
$function$

;
CREATE OR REPLACE FUNCTION itap.retention_candidates_unknown_identities(s itap.retention_scope)
 RETURNS TABLE(id uuid, held boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT i.id, itap.retention_held(s, i.id, NULL, NULL)
  FROM itap.identities i
  WHERE i.organization_id = (s).organization_id AND i.profile_id IS NULL AND NOT i.is_synthetic
    AND i.status <> 'merged' AND coalesce(i.last_seen_at, i.created_at) < (s).cutoff
    AND itap.retention_subject(s, i.id, NULL)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merge_sources x WHERE x.organization_id = i.organization_id AND x.source_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merges x WHERE x.organization_id = i.organization_id AND x.target_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merge_moves x WHERE x.organization_id = i.organization_id AND x.from_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.incident_identities x WHERE x.organization_id = i.organization_id AND x.identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.watch_list_entries x WHERE x.organization_id = i.organization_id AND x.identity_id = i.id)
    AND (i.id = ANY ((s).held_identities) OR NOT itap.retention_open_hold_target(i.organization_id, i.id, NULL))
    AND ((s).action = 'delete' OR i.attributes <> '{"anonymized": true}'::jsonb OR i.matching_enabled
         OR i.primary_photo_file_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM itap.identity_embeddings e WHERE e.organization_id = i.organization_id AND e.identity_id = i.id)
         OR EXISTS (SELECT 1 FROM itap.identity_photos p WHERE p.organization_id = i.organization_id AND p.identity_id = i.id));
$function$

;
DROP FUNCTION itap.retention_identity_evidence_held(itap.retention_scope, uuid);
DROP FUNCTION itap.retention_event_row_subject(itap.retention_scope, itap.events);
DROP FUNCTION itap.retention_event_row_held(itap.retention_scope, itap.events);
DROP FUNCTION itap.retention_attempt_subject(itap.retention_scope, uuid);
DROP FUNCTION itap.retention_attempt_held(itap.retention_scope, uuid);
