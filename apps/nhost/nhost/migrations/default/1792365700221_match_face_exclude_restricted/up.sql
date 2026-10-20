-- Restriction of processing (slice 10 task 1): match_face (camera recognition and enrollment duplicate checks) skips
-- identities linked to a profile with processing_restricted. From the latest definition (1792365700194); additive.
CREATE OR REPLACE FUNCTION itap.match_face(hasura_session json, p_embedding text, p_threshold real DEFAULT NULL::real, p_limit integer DEFAULT 5)
 RETURNS SETOF itap_results.face_matches
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'itap'
AS $function$
  WITH session_org AS (
    SELECT nullif(hasura_session ->> 'x-hasura-organization-id', '')::uuid AS organization_id
  ),
  params AS (
    SELECT s.organization_id,
           p_embedding::vector(512) AS probe,
           coalesce(p_threshold, os.recognition_threshold, 0.5) AS threshold,
           least(greatest(coalesce(p_limit, 5), 1), 100) AS max_rows
    FROM session_org s
    LEFT JOIN itap.organization_settings os ON os.organization_id = s.organization_id
    WHERE s.organization_id IS NOT NULL
  ),
  best AS (
    SELECT DISTINCT ON (i.id)
           i.organization_id, i.id AS identity_id, i.profile_id, (e.embedding <=> p.probe) AS distance
    FROM params p
    JOIN itap.identity_embeddings e ON e.organization_id = p.organization_id AND e.is_template
    JOIN itap.identities i ON i.organization_id = e.organization_id AND i.id = e.identity_id
    LEFT JOIN itap.profiles pr ON pr.organization_id = i.organization_id AND pr.id = i.profile_id
    WHERE i.matching_enabled
      AND i.status NOT IN ('merged', 'archived')
      AND NOT i.is_synthetic
      AND NOT coalesce(pr.processing_restricted, false)
      AND (e.embedding <=> p.probe) <= p.threshold
    ORDER BY i.id, distance
  )
  SELECT b.organization_id, b.identity_id, b.profile_id, b.distance::real, (1 - b.distance)::real AS similarity
  FROM best b
  ORDER BY b.distance, b.identity_id
  LIMIT (SELECT max_rows FROM params);
$function$
;
