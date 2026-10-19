-- Area hierarchy of a facility (spec §6.6). Same-facility consistency (spec §4.1): the parent FK carries facility_id,
-- so a parent of another facility (or organization) is impossible. Lifecycle by status: an area with children (or,
-- from task 2, devices / access points) cannot be deleted (NO ACTION FKs).
--
-- path / depth (system cache, read-only for clients; spec §6.0 array exception):
--   path  = ids from the root to the area itself, inclusive: root -> {root}, child -> {root, child}, ...
--   depth = cardinality(path) - 1 (a root has depth 0).
--   The subtree of X (X included) is `path @> ARRAY[X]` (GIN index).
CREATE TABLE itap.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  parent_id uuid,
  path uuid[] NOT NULL,
  depth integer NOT NULL,
  name text NOT NULL,
  description text,
  area_type text NOT NULL DEFAULT 'zone' REFERENCES itap.area_types (value),
  access_level text NOT NULL DEFAULT 'public' REFERENCES itap.area_access_levels (value),
  capacity integer,
  -- Floor-plan pixel space (itap.valid_shape); geofences are areas with a shape (incl. virtual_zone).
  shape jsonb,
  loitering_threshold_seconds integer,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.area_statuses (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Target of same-facility FKs (areas.parent_id, floor_plans, access_points, devices, device_areas).
  CONSTRAINT areas_organization_id_facility_id_id_key UNIQUE (organization_id, facility_id, id),
  CONSTRAINT areas_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id),
  CONSTRAINT areas_parent_fkey FOREIGN KEY (organization_id, facility_id, parent_id)
    REFERENCES itap.areas (organization_id, facility_id, id),
  CONSTRAINT areas_capacity_nonnegative CHECK (capacity IS NULL OR capacity >= 0),
  CONSTRAINT areas_loitering_threshold_positive CHECK (loitering_threshold_seconds IS NULL OR loitering_threshold_seconds > 0),
  CONSTRAINT areas_shape_valid CHECK (shape IS NULL OR itap.valid_shape(shape)),
  CONSTRAINT areas_path_consistent CHECK (
    cardinality(path) >= 1 AND path[cardinality(path)] = id AND depth = cardinality(path) - 1
  )
);

CREATE INDEX areas_organization_id_facility_id_parent_id_idx ON itap.areas (organization_id, facility_id, parent_id);
CREATE INDEX areas_organization_id_area_type_idx ON itap.areas (organization_id, area_type);
CREATE INDEX areas_organization_id_access_level_idx ON itap.areas (organization_id, access_level);
CREATE INDEX areas_organization_id_status_idx ON itap.areas (organization_id, status);
CREATE INDEX areas_path_idx ON itap.areas USING gin (path);

-- BEFORE INSERT / UPDATE OF parent_id, facility_id: computes path and depth from the parent, rejects cycles.
-- Concurrency: the updated row is locked by the UPDATE itself; the parent and all its ancestors are locked FOR SHARE,
-- so they cannot be re-parented (or have their path rewritten) until this transaction ends. Two concurrent moves that
-- would together form a cycle therefore serialize (the second one sees the first one's paths and fails with
-- area_cycle) or deadlock (one is aborted); a concurrent insert under a moving subtree waits for the move and reads
-- the new path. A parent that does not exist in the same organization and facility is left to the FK to report.
CREATE FUNCTION itap.areas_maintain_path() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  parent_path uuid[];
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := ARRAY[NEW.id];
  ELSE
    SELECT a.path INTO parent_path
    FROM itap.areas a
    WHERE a.organization_id = NEW.organization_id AND a.facility_id = NEW.facility_id AND a.id = NEW.parent_id
    FOR SHARE;
    IF NOT FOUND THEN
      NEW.path := ARRAY[NEW.id];
    ELSE
      IF NEW.id = ANY (parent_path) THEN
        PERFORM itap.raise_code('area_cycle');
      END IF;
      PERFORM 1 FROM itap.areas a WHERE a.id = ANY (parent_path) ORDER BY a.id FOR SHARE;
      NEW.path := parent_path || NEW.id;
    END IF;
  END IF;
  NEW.depth := cardinality(NEW.path) - 1;
  RETURN NEW;
END;
$$;

-- AFTER UPDATE OF parent_id: rewrites the path/depth of every descendant in one statement (old prefix -> new prefix).
CREATE FUNCTION itap.areas_rewrite_subtree() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  UPDATE itap.areas d
  SET path = NEW.path || d.path[array_position(d.path, NEW.id) + 1:],
      depth = cardinality(NEW.path) + cardinality(d.path) - array_position(d.path, NEW.id) - 1
  WHERE d.path @> ARRAY[NEW.id] AND d.id <> NEW.id AND d.organization_id = NEW.organization_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER areas_maintain_path BEFORE INSERT OR UPDATE OF parent_id, facility_id ON itap.areas
  FOR EACH ROW EXECUTE FUNCTION itap.areas_maintain_path();
CREATE TRIGGER areas_rewrite_subtree AFTER UPDATE OF parent_id ON itap.areas
  FOR EACH ROW WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id) EXECUTE FUNCTION itap.areas_rewrite_subtree();
CREATE TRIGGER areas_set_updated_at BEFORE UPDATE ON itap.areas
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
-- path/depth are system caches: subtree rewrites write no audit rows, a move is audited through parent_id.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.areas
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:path', 'ignore:depth');

-- Computed field facilities.areas_count (spec §6.6: computed, not a stored counter).
CREATE FUNCTION itap.facility_areas_count(facility_row itap.facilities) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT count(*)::integer FROM itap.areas a
  WHERE a.organization_id = facility_row.organization_id AND a.facility_id = facility_row.id;
$$;

-- Computed field areas.current_occupancy: people currently in the area's subtree. Occupancy data (area_occupancy)
-- arrives in slice 4, which replaces this body with a count over the subtree (`path @> ARRAY[area_row.id]`).
CREATE FUNCTION itap.area_current_occupancy(area_row itap.areas) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT 0;
$$;
