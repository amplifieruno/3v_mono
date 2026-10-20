-- Previous definition (1792365700200_search_exclude_synthetic).
CREATE OR REPLACE FUNCTION itap.search_candidates(p_org uuid, f jsonb)
 RETURNS TABLE(id uuid, profile_id uuid, last_seen_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH eff AS MATERIALIZED (
    SELECT e.identity_id, e.effective_id FROM itap.effective_identities(p_org) e
  ),
  grp AS MATERIALIZED (
    SELECT e.effective_id, min(m.first_seen_at) AS first_seen_at, max(m.last_seen_at) AS last_seen_at
    FROM eff e JOIN itap.identities m ON m.organization_id = p_org AND m.id = e.identity_id
    GROUP BY e.effective_id
  )
  SELECT i.id, i.profile_id, g.last_seen_at
  FROM itap.identities i
  JOIN grp g ON g.effective_id = i.id
  LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
  WHERE i.organization_id = p_org
    AND i.status <> 'merged'
    AND i.matching_enabled
    AND NOT i.is_synthetic
    AND (NOT f ? 'status' OR i.status IN (SELECT jsonb_array_elements_text(f -> 'status')))
    AND (NOT f ? 'linked' OR (i.profile_id IS NOT NULL) = (f ->> 'linked')::boolean)
    AND (NOT f ? 'profile_type' OR p.profile_type IN (SELECT jsonb_array_elements_text(f -> 'profile_type')))
    AND (NOT f ? 'company_id' OR p.company_id = (f ->> 'company_id')::uuid)
    AND (NOT f ? 'gender' OR i.attributes ->> 'gender' = f ->> 'gender')
    AND (NOT f ? 'age_min' OR i.age >= (f ->> 'age_min')::numeric)
    AND (NOT f ? 'age_max' OR i.age <= (f ->> 'age_max')::numeric)
    AND (NOT f ? 'first_seen_from' OR g.first_seen_at >= (f ->> 'first_seen_from')::timestamptz)
    AND (NOT f ? 'first_seen_to' OR g.first_seen_at <= (f ->> 'first_seen_to')::timestamptz)
    AND (NOT f ? 'last_seen_from' OR g.last_seen_at >= (f ->> 'last_seen_from')::timestamptz)
    AND (NOT f ? 'last_seen_to' OR g.last_seen_at <= (f ->> 'last_seen_to')::timestamptz)
    AND (NOT (f ? 'facility_id' OR f ? 'seen_from' OR f ? 'seen_to') OR EXISTS (
      SELECT 1
      FROM eff e
      JOIN itap.tracking_sessions s ON s.organization_id = p_org AND s.identity_id = e.identity_id
      WHERE e.effective_id = i.id
        AND (NOT f ? 'facility_id' OR s.facility_id = (f ->> 'facility_id')::uuid)
        AND (NOT f ? 'seen_from' OR coalesce(s.ended_at, s.last_detected_at) >= (f ->> 'seen_from')::timestamptz)
        AND (NOT f ? 'seen_to' OR s.started_at <= (f ->> 'seen_to')::timestamptz)));
$function$
;
