-- Dashboards (spec §6.10, plan-07 task 5): owner-managed layouts of widgets; shared ones are readable (never editable)
-- by the organization. owner_id is stamped from the session (metadata preset) and must be a member.
--
-- Widget contract (itap.valid_dashboard_widgets; IMMUTABLE, never raises): `widgets` is an array of at most 50
-- objects with exactly the keys
--   id        string, 1..64 characters, unique within the dashboard;
--   kind      kpi | occupancy_series | flow_matrix | heatmap | incidents_list | segment_trend | device_health |
--             deliveries;
--   title     string, not blank, at most 200 characters;
--   query     the GraphQL root field the widget reads, one of the kind's sources (itap.dashboard_widget_queries):
--               kpi              dashboard_kpis
--               occupancy_series occupancy_series, facility_occupancy_now
--               flow_matrix      flow_matrix
--               heatmap          area_hourly_stats, occupancy_series
--               incidents_list   incidents
--               segment_trend    segment_daily_stats
--               device_health    devices, device_health_metrics
--               deliveries       delivery_report
--             (tracked query functions, or tenant tables for list widgets; every source is permission-checked for
--             the viewer when the widget runs, so a shared dashboard never widens access);
--   params    object: the arguments / filters the UI passes to the query (facility_id, bucket, days, limit, ...);
--             free-form, not validated here (the query function validates its own arguments);
--   position  object with exactly the integer keys x, y, w, h on a 12-column grid: 0 <= x, 1 <= w, x + w <= 12,
--             0 <= y <= 1000, 1 <= h <= 24.
-- `layout` is an object of UI preferences (e.g. {"columns": 12, "row_height": 80}); not interpreted by the database.

CREATE FUNCTION itap.dashboard_widget_queries() RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT '{
    "kpi": ["dashboard_kpis"],
    "occupancy_series": ["occupancy_series", "facility_occupancy_now"],
    "flow_matrix": ["flow_matrix"],
    "heatmap": ["area_hourly_stats", "occupancy_series"],
    "incidents_list": ["incidents"],
    "segment_trend": ["segment_daily_stats"],
    "device_health": ["devices", "device_health_metrics"],
    "deliveries": ["delivery_report"]
  }'::jsonb;
$$;

-- True when v is a JSON integer in [lo, hi].
CREATE FUNCTION itap.jsonb_int_between(v jsonb, lo integer, hi integer) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(jsonb_typeof(v) = 'number' AND (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
                  AND (v #>> '{}')::numeric BETWEEN lo AND hi, false);
$$;

CREATE FUNCTION itap.valid_dashboard_widgets(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  w jsonb;
  pos jsonb;
  ids text[] := '{}';
  sources jsonb := itap.dashboard_widget_queries();
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 50 THEN
    RETURN false;
  END IF;
  FOR w IN SELECT e FROM jsonb_array_elements(p) e LOOP
    IF jsonb_typeof(w) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(w) k)
          IS DISTINCT FROM ARRAY['id', 'kind', 'params', 'position', 'query', 'title'] THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'id') <> 'string' OR length(w ->> 'id') NOT BETWEEN 1 AND 64 OR (w ->> 'id') = ANY (ids) THEN
      RETURN false;
    END IF;
    ids := ids || (w ->> 'id');
    IF jsonb_typeof(w -> 'kind') <> 'string' OR NOT sources ? (w ->> 'kind')
       OR jsonb_typeof(w -> 'query') <> 'string' OR NOT (sources -> (w ->> 'kind')) ? (w ->> 'query') THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'title') <> 'string' OR btrim(w ->> 'title') = '' OR length(w ->> 'title') > 200 THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'params') <> 'object' THEN
      RETURN false;
    END IF;
    pos := w -> 'position';
    IF jsonb_typeof(pos) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pos) k) IS DISTINCT FROM ARRAY['h', 'w', 'x', 'y']
       OR NOT itap.jsonb_int_between(pos -> 'x', 0, 11) OR NOT itap.jsonb_int_between(pos -> 'w', 1, 12)
       OR NOT itap.jsonb_int_between(pos -> 'y', 0, 1000) OR NOT itap.jsonb_int_between(pos -> 'h', 1, 24)
       OR (pos ->> 'x')::integer + (pos ->> 'w')::integer > 12 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE itap.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboards_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT dashboards_owner_name_key UNIQUE (organization_id, owner_id, name),
  CONSTRAINT dashboards_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT dashboards_layout_object CHECK (jsonb_typeof(layout) = 'object'),
  CONSTRAINT dashboards_widgets_valid CHECK (itap.valid_dashboard_widgets(widgets)),
  CONSTRAINT dashboards_owner_fkey FOREIGN KEY (organization_id, owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE TRIGGER dashboards_owner_active BEFORE INSERT OR UPDATE OF owner_id ON itap.dashboards
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('owner_id');
CREATE TRIGGER dashboards_set_updated_at BEFORE UPDATE ON itap.dashboards
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.dashboards
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
