-- Slice 10 task 1 fix round 2: legal hold coverage is the fixed point of the person graph. From the given identities
-- and profiles, itap.legal_hold_subjects walks identity -> its profile, profile -> its identities and identity <->
-- identity over completed merges (both directions) until nothing new is reached (recursive CTE with UNION, seed-driven:
-- only edges of reached nodes are read, through indexed lookups). Every coverage helper uses it, so e.g. A merged into
-- B, B and C linked to P: a hold on A holds B, P and C, and a hold on C holds A. identity_merge_group is seed-driven too.

-- Nodes reachable from the seeds: (kind 'identity' | 'profile', id).
CREATE FUNCTION itap.legal_hold_subjects(p_org uuid, p_identities uuid[], p_profiles uuid[])
RETURNS TABLE (kind text, id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE walk (kind, id) AS (
    SELECT 'identity'::text, x FROM unnest(p_identities) AS x WHERE x IS NOT NULL
    UNION
    SELECT 'profile'::text, x FROM unnest(p_profiles) AS x WHERE x IS NOT NULL
    UNION
    SELECT n.kind, n.id
    FROM walk w
    CROSS JOIN LATERAL (
      SELECT 'profile'::text AS kind, i.profile_id AS id FROM itap.identities i
      WHERE w.kind = 'identity' AND i.organization_id = p_org AND i.id = w.id AND i.profile_id IS NOT NULL
      UNION ALL
      SELECT 'identity', m.target_identity_id FROM itap.identity_merge_sources s
      JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id AND m.status = 'completed'
      WHERE w.kind = 'identity' AND s.organization_id = p_org AND s.source_identity_id = w.id
      UNION ALL
      SELECT 'identity', s.source_identity_id FROM itap.identity_merges m
      JOIN itap.identity_merge_sources s ON s.organization_id = m.organization_id AND s.merge_id = m.id
      WHERE w.kind = 'identity' AND m.organization_id = p_org AND m.target_identity_id = w.id AND m.status = 'completed'
      UNION ALL
      SELECT 'identity', i.id FROM itap.identities i
      WHERE w.kind = 'profile' AND i.organization_id = p_org AND i.profile_id = w.id
    ) n
  )
  SELECT kind, id FROM walk;
$$;

-- Identities connected to p_ids by completed merges only (either direction, transitive), p_ids included.
CREATE OR REPLACE FUNCTION itap.identity_merge_group(p_org uuid, p_ids uuid[]) RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE walk (id) AS (
    SELECT x FROM unnest(p_ids) AS x WHERE x IS NOT NULL
    UNION
    SELECT n.id
    FROM walk w
    CROSS JOIN LATERAL (
      SELECT m.target_identity_id AS id FROM itap.identity_merge_sources s
      JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id AND m.status = 'completed'
      WHERE s.organization_id = p_org AND s.source_identity_id = w.id
      UNION ALL
      SELECT s.source_identity_id FROM itap.identity_merges m
      JOIN itap.identity_merge_sources s ON s.organization_id = m.organization_id AND s.merge_id = m.id
      WHERE m.organization_id = p_org AND m.target_identity_id = w.id AND m.status = 'completed'
    ) n
  )
  SELECT id FROM walk;
$$;

-- Whether an active hold (at p_at) targets one of the subjects reachable from the seeds.
CREATE OR REPLACE FUNCTION itap.legal_hold_covers_group(p_org uuid, p_ids uuid[], p_profiles uuid[], p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH subjects AS MATERIALIZED (SELECT * FROM itap.legal_hold_subjects(p_org, p_ids, p_profiles))
  SELECT EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.identity_id IN (SELECT s.id FROM subjects s WHERE s.kind = 'identity')
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
    UNION ALL
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.profile_id IN (SELECT s.id FROM subjects s WHERE s.kind = 'profile')
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  );
$$;

CREATE OR REPLACE FUNCTION itap.legal_hold_covers_identity(p_org uuid, p_identity uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_identity IS NOT NULL AND itap.legal_hold_covers_group(p_org, ARRAY[p_identity], '{}'::uuid[], p_at);
$$;

CREATE OR REPLACE FUNCTION itap.legal_hold_covers_profile(p_org uuid, p_profile uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_profile IS NOT NULL AND itap.legal_hold_covers_group(p_org, '{}'::uuid[], ARRAY[p_profile], p_at);
$$;

-- Everything reachable from the active identity / profile targets.
CREATE OR REPLACE FUNCTION itap.held_identity_ids(p_org uuid, p_at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH t AS MATERIALIZED (
    SELECT t.identity_id, t.profile_id
    FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND (t.identity_id IS NOT NULL OR t.profile_id IS NOT NULL)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  )
  SELECT s.id FROM itap.legal_hold_subjects(
    p_org, ARRAY(SELECT identity_id FROM t WHERE identity_id IS NOT NULL), ARRAY(SELECT profile_id FROM t WHERE profile_id IS NOT NULL)
  ) s WHERE s.kind = 'identity';
$$;

CREATE OR REPLACE FUNCTION itap.held_profile_ids(p_org uuid, p_at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH t AS MATERIALIZED (
    SELECT t.identity_id, t.profile_id
    FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND (t.identity_id IS NOT NULL OR t.profile_id IS NOT NULL)
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  )
  SELECT s.id FROM itap.legal_hold_subjects(
    p_org, ARRAY(SELECT identity_id FROM t WHERE identity_id IS NOT NULL), ARRAY(SELECT profile_id FROM t WHERE profile_id IS NOT NULL)
  ) s WHERE s.kind = 'profile';
$$;
