-- Rank of an access level on the shared 1..4 scale (spec §6.0 ordered enums): profile clearances
-- (access_levels: basic < standard < elevated < admin) and area levels (area_access_levels: public < restricted <
-- secure < classified) keep their own vocabularies but share one scale, so "area level above profile clearance" is
-- defined. NULL for an unknown value. Comparisons of access levels always go through it.
CREATE FUNCTION itap.access_rank(p_level text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_level
    WHEN 'basic' THEN 1
    WHEN 'public' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'restricted' THEN 2
    WHEN 'elevated' THEN 3
    WHEN 'secure' THEN 3
    WHEN 'admin' THEN 4
    WHEN 'classified' THEN 4
  END;
$$;
