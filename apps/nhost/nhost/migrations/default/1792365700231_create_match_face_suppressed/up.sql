-- Slice 10 task 1 fix round 1: faces of people whose processing is restricted (profile processing_restricted) or who
-- withdrew biometric consent (identities.matching_enabled false) must not be processed at all. match_face keeps its
-- contract (never returns them); itap.match_face_suppressed tells the backend that a probe is such a face: one row with
-- the best similarity among the templates of those identities (not merged, not synthetic) within p_threshold (the same
-- maximum cosine distance as match_face, default organization_settings.recognition_threshold), none otherwise.
-- Recognition drops the face (no detection, no new identity), enrollment refuses with subject_restricted. Admin-only
-- (backend clients carry the organization session); the organization comes from the session like match_face.
CREATE TABLE itap_results.face_suppressions (
  organization_id uuid NOT NULL,
  similarity real NOT NULL
);

CREATE FUNCTION itap.match_face_suppressed(hasura_session json, p_embedding text, p_threshold real DEFAULT NULL)
RETURNS SETOF itap_results.face_suppressions
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, itap
AS $$
  WITH params AS (
    SELECT s.organization_id, p_embedding::vector(512) AS probe,
           coalesce(p_threshold, os.recognition_threshold, 0.5) AS threshold
    FROM (SELECT nullif(hasura_session ->> 'x-hasura-organization-id', '')::uuid AS organization_id) s
    LEFT JOIN itap.organization_settings os ON os.organization_id = s.organization_id
    WHERE s.organization_id IS NOT NULL
  )
  SELECT p.organization_id, (1 - min(e.embedding <=> p.probe))::real
  FROM params p
  JOIN itap.identity_embeddings e ON e.organization_id = p.organization_id AND e.is_template
  JOIN itap.identities i ON i.organization_id = e.organization_id AND i.id = e.identity_id
  LEFT JOIN itap.profiles pr ON pr.organization_id = i.organization_id AND pr.id = i.profile_id
  WHERE i.status <> 'merged' AND NOT i.is_synthetic
    AND (NOT i.matching_enabled OR coalesce(pr.processing_restricted, false))
    AND (e.embedding <=> p.probe) <= p.threshold
  GROUP BY p.organization_id;
$$;
