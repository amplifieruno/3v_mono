-- Slice 10 task 2 fix round 1: indirect references to held people (and to a DSR subject).
-- * An event is held when it names a held person directly, in its payload (claimed_identity_id / matched_identity_id
--   of face authentication events), through its authentication attempt (claimed / matched identity, profile), or when
--   it is linked to a held incident (incident_events). The subject predicate (DSR erasure) mirrors it. Deliveries and
--   webhook deliveries follow their event (retention_event_held / retention_event_subject).
-- * An unknown identity is held when its detections, locations, sessions or events lie in a held facility, or one of
--   its events is linked to a held incident (deleting it would null the person in held evidence).

-- Whether the attempt names a held person / the subject.
CREATE FUNCTION itap.retention_attempt_held(s itap.retention_scope, p_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_attempt IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = (s).organization_id AND a.id = p_attempt
      AND (itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)));
$$;

CREATE FUNCTION itap.retention_attempt_subject(s itap.retention_scope, p_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_attempt IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = (s).organization_id AND a.id = p_attempt
      AND (coalesce(a.matched_identity_id = ANY ((s).subject_identities), false)
           OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false)
           OR coalesce(a.profile_id = ANY ((s).subject_profiles), false)));
$$;

CREATE FUNCTION itap.retention_event_row_held(s itap.retention_scope, e itap.events) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT itap.retention_held(s, e.identity_id, e.profile_id, e.facility_id)
    OR coalesce(e.payload ->> 'claimed_identity_id' = ANY ((s).held_identities::text[]), false)
    OR coalesce(e.payload ->> 'matched_identity_id' = ANY ((s).held_identities::text[]), false)
    OR itap.retention_attempt_held(s, e.authentication_attempt_id)
    OR EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
               AND ie.event_id = e.id AND ie.incident_id = ANY ((s).held_incidents));
$$;

CREATE FUNCTION itap.retention_event_row_subject(s itap.retention_scope, e itap.events) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (s).subject_identities IS NULL
    OR itap.retention_subject(s, e.identity_id, e.profile_id)
    OR coalesce(e.payload ->> 'claimed_identity_id' = ANY ((s).subject_identities::text[]), false)
    OR coalesce(e.payload ->> 'matched_identity_id' = ANY ((s).subject_identities::text[]), false)
    OR itap.retention_attempt_subject(s, e.authentication_attempt_id);
$$;

CREATE OR REPLACE FUNCTION itap.retention_candidates_events(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT e.id, itap.retention_event_row_held(s, e)
  FROM itap.events e
  WHERE e.organization_id = (s).organization_id AND e.occurred_at < (s).cutoff
    AND itap.retention_in_facility(s, e.facility_id) AND itap.retention_event_row_subject(s, e)
    AND NOT EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
                    AND ie.event_id = e.id AND NOT (ie.incident_id = ANY ((s).held_incidents)))
    AND ((s).action = 'delete' OR NOT (e.payload ? 'anonymized'));
$$;

CREATE OR REPLACE FUNCTION itap.retention_event_held(s itap.retention_scope, p_event uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_event_row_held(s, e));
$$;

CREATE OR REPLACE FUNCTION itap.retention_event_subject(s itap.retention_scope, p_event uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (s).subject_identities IS NULL OR (p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_event_row_subject(s, e)));
$$;

-- Whether deleting the identity would touch evidence in a held facility or of a held incident.
CREATE FUNCTION itap.retention_identity_evidence_held(s itap.retention_scope, p_identity uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (cardinality((s).held_facilities) > 0 AND (
           EXISTS (SELECT 1 FROM itap.detections d WHERE d.organization_id = (s).organization_id
                   AND d.identity_id = p_identity AND d.facility_id = ANY ((s).held_facilities))
        OR EXISTS (SELECT 1 FROM itap.identity_locations l WHERE l.organization_id = (s).organization_id
                   AND l.identity_id = p_identity AND l.facility_id = ANY ((s).held_facilities))
        OR EXISTS (SELECT 1 FROM itap.tracking_sessions t WHERE t.organization_id = (s).organization_id
                   AND t.identity_id = p_identity AND t.facility_id = ANY ((s).held_facilities))
        OR EXISTS (SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id
                   AND e.identity_id = p_identity AND e.facility_id = ANY ((s).held_facilities))))
    OR (cardinality((s).held_incidents) > 0 AND EXISTS (
           SELECT 1 FROM itap.events e
           JOIN itap.incident_events ie ON ie.organization_id = e.organization_id AND ie.event_id = e.id
           WHERE e.organization_id = (s).organization_id AND e.identity_id = p_identity
             AND ie.incident_id = ANY ((s).held_incidents)));
$$;

CREATE OR REPLACE FUNCTION itap.retention_candidates_unknown_identities(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT i.id, itap.retention_held(s, i.id, NULL, NULL) OR itap.retention_identity_evidence_held(s, i.id)
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
$$;
