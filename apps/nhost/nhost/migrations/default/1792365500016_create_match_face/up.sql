-- Result row type of itap.match_face. Never stores rows; tracked so Hasura can expose the function, with the
-- standard organization filter on its select permission (double guard, §8.0).
CREATE TABLE itap_results.face_matches (
  organization_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  profile_id uuid,
  distance real NOT NULL,
  similarity real NOT NULL
);

-- Face matching (§7): exact cosine-distance scan over the templates of the session organization's identities that
-- have matching enabled and are not merged/archived. One row per identity (its best template), nearest first.
-- p_embedding: pgvector text literal '[x1,...,x512]' (pgvector has no GraphQL scalar).
-- p_threshold: maximum cosine distance; defaults to organization_settings.recognition_threshold (0.5 if missing).
-- p_limit: 1..100, default 5.
-- The organization comes from the session only: a session without x-hasura-organization-id (e.g. the bare admin
-- secret) matches nothing; with the admin secret plus forwarded headers it is scoped to the forwarded organization.
CREATE FUNCTION itap.match_face(
  hasura_session json,
  p_embedding text,
  p_threshold real DEFAULT NULL,
  p_limit integer DEFAULT 5
) RETURNS SETOF itap_results.face_matches
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, itap
AS $$
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
    WHERE i.matching_enabled
      AND i.status NOT IN ('merged', 'archived')
      AND (e.embedding <=> p.probe) <= p.threshold
    ORDER BY i.id, distance
  )
  SELECT b.organization_id, b.identity_id, b.profile_id, b.distance::real, (1 - b.distance)::real AS similarity
  FROM best b
  ORDER BY b.distance, b.identity_id
  LIMIT (SELECT max_rows FROM params);
$$;
