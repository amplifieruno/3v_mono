-- Previous definitions (1792365700214_create_legal_holds).
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
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  JOIN itap.identities i ON i.organization_id = t.organization_id AND i.id = t.identity_id
  WHERE t.organization_id = p_org AND t.identity_id IS NOT NULL AND i.profile_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at);
$function$

;
CREATE OR REPLACE FUNCTION itap.held_identity_ids(p_org uuid, p_at timestamp with time zone)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT t.identity_id
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  WHERE t.organization_id = p_org AND t.identity_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  UNION
  SELECT i.id
  FROM itap.held_profile_ids(p_org, p_at) hp (profile_id)
  JOIN itap.identities i ON i.organization_id = p_org AND i.profile_id = hp.profile_id;
$function$

;
CREATE OR REPLACE FUNCTION itap.legal_hold_covers_profile(p_org uuid, p_profile uuid, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT p_profile IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    LEFT JOIN itap.identities i ON i.organization_id = t.organization_id AND i.id = t.identity_id
    WHERE t.organization_id = p_org
      AND (t.profile_id = p_profile OR (t.identity_id IS NOT NULL AND i.profile_id = p_profile))
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
  SELECT p_identity IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM itap.legal_hold_targets t
      JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
      WHERE t.organization_id = p_org AND t.identity_id = p_identity
        AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at))
    OR itap.legal_hold_covers_profile(
      p_org, (SELECT i.profile_id FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_identity), p_at)
  );
$function$

;
DROP FUNCTION itap.legal_hold_covers_group(uuid, uuid[], uuid[], timestamptz);
DROP FUNCTION itap.identity_merge_group(uuid, uuid[]);
DROP TRIGGER legal_hold_targets_delete_guard ON itap.legal_hold_targets;
DROP FUNCTION itap.legal_hold_targets_delete_guard();
