-- Previous definitions (1792365700226_legal_holds_fix_round1).
CREATE OR REPLACE FUNCTION itap.identity_merge_group(p_org uuid, p_ids uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH RECURSIVE edges AS MATERIALIZED (
    SELECT s.source_identity_id AS a, m.target_identity_id AS b
    FROM itap.identity_merge_sources s
    JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id
    WHERE s.organization_id = p_org AND m.status = 'completed'
  ),
  walk (id) AS (
    SELECT x FROM unnest(p_ids) AS x WHERE x IS NOT NULL
    UNION
    SELECT CASE WHEN e.a = w.id THEN e.b ELSE e.a END FROM walk w JOIN edges e ON e.a = w.id OR e.b = w.id
  )
  SELECT id FROM walk;
$function$

;
CREATE OR REPLACE FUNCTION itap.legal_hold_covers_group(p_org uuid, p_ids uuid[], p_profiles uuid[], p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH profs AS MATERIALIZED (
    SELECT x AS profile_id FROM unnest(p_profiles) AS x WHERE x IS NOT NULL
    UNION
    SELECT i.profile_id FROM itap.identities i
    WHERE i.organization_id = p_org AND i.id = ANY (p_ids) AND i.profile_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.identity_id = ANY (p_ids)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
    UNION ALL
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.profile_id IN (SELECT profile_id FROM profs)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
    UNION ALL
    SELECT 1 FROM itap.identities i
    JOIN itap.legal_hold_targets t ON t.organization_id = i.organization_id AND t.identity_id = i.id
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE i.organization_id = p_org AND i.profile_id IN (SELECT profile_id FROM profs)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  );
$function$

;
CREATE OR REPLACE FUNCTION itap.legal_hold_covers_identity(p_org uuid, p_identity uuid, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT p_identity IS NOT NULL AND itap.legal_hold_covers_group(
    p_org, ARRAY(SELECT itap.identity_merge_group(p_org, ARRAY[p_identity])), '{}'::uuid[], p_at);
$function$

;
CREATE OR REPLACE FUNCTION itap.legal_hold_covers_profile(p_org uuid, p_profile uuid, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT p_profile IS NOT NULL AND itap.legal_hold_covers_group(
    p_org,
    ARRAY(SELECT itap.identity_merge_group(p_org, ARRAY(
      SELECT i.id FROM itap.identities i WHERE i.organization_id = p_org AND i.profile_id = p_profile))),
    ARRAY[p_profile], p_at);
$function$

;
CREATE OR REPLACE FUNCTION itap.held_identity_ids(p_org uuid, p_at timestamp with time zone)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH t AS MATERIALIZED (
    SELECT t.identity_id, t.profile_id
    FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND (t.identity_id IS NOT NULL OR t.profile_id IS NOT NULL)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  ),
  profs AS (
    SELECT profile_id FROM t WHERE profile_id IS NOT NULL
    UNION
    SELECT i.profile_id FROM t JOIN itap.identities i ON i.organization_id = p_org AND i.id = t.identity_id
    WHERE i.profile_id IS NOT NULL
  ),
  seed AS (
    SELECT identity_id AS id FROM t WHERE identity_id IS NOT NULL
    UNION
    SELECT i.id FROM itap.identities i WHERE i.organization_id = p_org AND i.profile_id IN (SELECT profile_id FROM profs)
  )
  SELECT itap.identity_merge_group(p_org, ARRAY(SELECT id FROM seed));
$function$

;
CREATE OR REPLACE FUNCTION itap.held_profile_ids(p_org uuid, p_at timestamp with time zone)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT t.profile_id
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  WHERE t.organization_id = p_org AND t.profile_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  UNION
  SELECT i.profile_id
  FROM itap.held_identity_ids(p_org, p_at) x (id)
  JOIN itap.identities i ON i.organization_id = p_org AND i.id = x.id
  WHERE i.profile_id IS NOT NULL;
$function$

;
DROP FUNCTION itap.legal_hold_subjects(uuid, uuid[], uuid[]);
