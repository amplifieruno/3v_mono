-- Result row type of itap.search_identities (stores nothing; admin secret only).
CREATE TABLE itap_results.search_matches (
  organization_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  profile_id uuid,
  rank integer NOT NULL,
  confidence real,
  match_type text NOT NULL
);

-- Search candidates of an organization: identities that are not merged (merge sources keep their history; the
-- target is the effective identity) and have matching_enabled (false only after biometric consent was withdrawn,
-- slice 2), so identities whose consent was withdrawn are never returned by any search mode. Archived and suspended
-- identities are candidates (investigation tool; the status filter narrows). Filters: see *_create_search_tables.
CREATE FUNCTION itap.search_candidates(p_org uuid, f jsonb)
RETURNS TABLE (id uuid, profile_id uuid, last_seen_at timestamptz)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT i.id, i.profile_id, i.last_seen_at
  FROM itap.identities i
  LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
  WHERE i.organization_id = p_org
    AND i.status <> 'merged'
    AND i.matching_enabled
    AND (NOT f ? 'status' OR i.status IN (SELECT jsonb_array_elements_text(f -> 'status')))
    AND (NOT f ? 'linked' OR (i.profile_id IS NOT NULL) = (f ->> 'linked')::boolean)
    AND (NOT f ? 'profile_type' OR p.profile_type IN (SELECT jsonb_array_elements_text(f -> 'profile_type')))
    AND (NOT f ? 'company_id' OR p.company_id = (f ->> 'company_id')::uuid)
    AND (NOT f ? 'gender' OR i.attributes ->> 'gender' = f ->> 'gender')
    AND (NOT f ? 'age_min' OR i.age >= (f ->> 'age_min')::numeric)
    AND (NOT f ? 'age_max' OR i.age <= (f ->> 'age_max')::numeric)
    AND (NOT f ? 'first_seen_from' OR i.first_seen_at >= (f ->> 'first_seen_from')::timestamptz)
    AND (NOT f ? 'first_seen_to' OR i.first_seen_at <= (f ->> 'first_seen_to')::timestamptz)
    AND (NOT f ? 'last_seen_from' OR i.last_seen_at >= (f ->> 'last_seen_from')::timestamptz)
    AND (NOT f ? 'last_seen_to' OR i.last_seen_at <= (f ->> 'last_seen_to')::timestamptz)
    AND (NOT (f ? 'facility_id' OR f ? 'seen_from' OR f ? 'seen_to') OR EXISTS (
      SELECT 1 FROM itap.tracking_sessions s
      WHERE s.organization_id = p_org AND s.identity_id = i.id
        AND (NOT f ? 'facility_id' OR s.facility_id = (f ->> 'facility_id')::uuid)
        AND (NOT f ? 'seen_from' OR coalesce(s.ended_at, s.last_detected_at) >= (f ->> 'seen_from')::timestamptz)
        AND (NOT f ? 'seen_to' OR s.started_at <= (f ->> 'seen_to')::timestamptz)));
$$;

-- Ranked identities of an organization for a search (spec §8.5 search_faces; called by the backend search service
-- with the admin secret). Candidates: itap.search_candidates (filters invalid -> search_filters_invalid).
--   p_embedding given (pgvector text literal): best template similarity per identity (1 - cosine distance, exact
--     scan as in match_face). Kept when similarity >= threshold, or >= threshold - 0.1 when p_fuzzy.
--     match_type: exact >= threshold + 0.15, partial >= threshold, fuzzy below. Order: similarity desc, then id.
--     threshold = p_threshold, else 1 - organization_settings.recognition_threshold (a max distance; 0.5 if missing),
--     clamped to 0.2..0.95.
--   p_embedding NULL (attribute search): every candidate, confidence NULL, match_type exact (all filters matched),
--     ordered by last_seen_at desc (never seen last), then id.
-- p_limit: 1..100 (default 20). Ranks are 1-based.
CREATE FUNCTION itap.search_identities(
  p_org uuid,
  p_embedding text,
  p_threshold real,
  p_limit integer,
  p_filters jsonb,
  p_fuzzy boolean DEFAULT false
) RETURNS SETOF itap_results.search_matches
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, itap
AS $$
DECLARE
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  max_rows integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  threshold real;
  cutoff real;
  probe vector(512);
BEGIN
  IF NOT itap.valid_search_filters(f) OR NOT itap.search_filter_refs(p_org, f) THEN
    PERFORM itap.raise_code('search_filters_invalid');
  END IF;

  IF p_embedding IS NULL THEN
    RETURN QUERY
    SELECT p_org, c.id, c.profile_id,
           (row_number() OVER (ORDER BY c.last_seen_at DESC NULLS LAST, c.id))::integer,
           NULL::real, 'exact'::text
    FROM itap.search_candidates(p_org, f) c
    ORDER BY c.last_seen_at DESC NULLS LAST, c.id
    LIMIT max_rows;
    RETURN;
  END IF;

  probe := p_embedding::vector(512);
  SELECT least(greatest(coalesce(p_threshold, 1 - os.recognition_threshold, 0.5), 0.2), 0.95)
  INTO threshold
  FROM (SELECT 1) one
  LEFT JOIN itap.organization_settings os ON os.organization_id = p_org;
  cutoff := CASE WHEN coalesce(p_fuzzy, false) THEN threshold - 0.1 ELSE threshold END;

  RETURN QUERY
  WITH scored AS (
    SELECT c.id, c.profile_id, (1 - best.distance)::real AS similarity
    FROM itap.search_candidates(p_org, f) c
    CROSS JOIN LATERAL (
      SELECT min(e.embedding <=> probe) AS distance
      FROM itap.identity_embeddings e
      WHERE e.organization_id = p_org AND e.identity_id = c.id AND e.is_template
    ) best
    WHERE best.distance IS NOT NULL AND (1 - best.distance) >= cutoff
  )
  SELECT p_org, s.id, s.profile_id,
         (row_number() OVER (ORDER BY s.similarity DESC, s.id))::integer,
         s.similarity,
         CASE WHEN s.similarity >= threshold + 0.15 THEN 'exact'
              WHEN s.similarity >= threshold THEN 'partial'
              ELSE 'fuzzy' END
  FROM scored s
  ORDER BY s.similarity DESC, s.id
  LIMIT max_rows;
END;
$$;
