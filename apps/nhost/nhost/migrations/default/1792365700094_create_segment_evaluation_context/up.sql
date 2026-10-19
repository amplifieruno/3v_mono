-- Segment evaluation context (slice 6 task 2). The backend translator (conditions -> Hasura where, spec §8.0) is a
-- pure function; everything that depends on the evaluation time and on timezones is resolved here, once, with the
-- same helpers the rest of the schema uses (itap.in_windows):
--   * the organization-local date of p_at and its bounds as instants (visit_status_today, date relative_days);
--   * the work schedules whose windows contain p_at (on_shift_now);
--   * with p_segment: whether the segment is evaluated at p_at at all (itap.segment_active_at);
--   * with p_conditions: validation (itap.validate_segment_conditions; preview_segment checks unsaved conditions).

-- A segment takes rule members at p_at only when it is dynamic, active, inside active_from / active_until and, with a
-- non-empty schedule, inside one of its windows (organization timezone). Otherwise evaluation closes its rule rows.
CREATE FUNCTION itap.segment_active_at(p_segment itap.segments, p_timezone text, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_segment.kind = 'dynamic' AND p_segment.status = 'active'
    AND (p_segment.active_from IS NULL OR p_at >= p_segment.active_from)
    AND (p_segment.active_until IS NULL OR p_at < p_segment.active_until)
    AND (p_segment.schedule IS NULL OR jsonb_array_length(p_segment.schedule) = 0
         OR itap.in_windows(p_segment.schedule, p_timezone, p_at));
$$;

-- Row type of the tracked query (stores nothing).
CREATE TABLE itap_results.segment_evaluation_contexts (
  organization_id uuid NOT NULL,
  evaluated_at timestamptz NOT NULL,
  timezone text NOT NULL,
  local_date date NOT NULL,
  day_start timestamptz NOT NULL,
  day_end timestamptz NOT NULL,
  on_shift_schedule_ids uuid[] NOT NULL,
  segment_active boolean
);

CREATE FUNCTION itap.segment_evaluation_context(
  hasura_session json, p_at timestamptz, p_target text DEFAULT NULL, p_conditions jsonb DEFAULT NULL, p_segment uuid DEFAULT NULL
) RETURNS SETOF itap_results.segment_evaluation_contexts
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  tz text;
  seg itap.segments;
  active boolean;
  local_day date;
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('segment_evaluation_time_required');
  END IF;
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = org;
  IF p_segment IS NOT NULL THEN
    SELECT * INTO seg FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment;
    IF NOT FOUND THEN
      PERFORM itap.raise_code('segment_not_found');
    END IF;
    active := itap.segment_active_at(seg, tz, p_at);
  END IF;
  IF p_conditions IS NOT NULL THEN
    PERFORM itap.validate_segment_conditions(org, p_target, p_conditions, p_segment);
  END IF;
  local_day := (p_at AT TIME ZONE tz)::date;
  RETURN QUERY
  SELECT org, p_at, tz, local_day, local_day::timestamp AT TIME ZONE tz, (local_day + 1)::timestamp AT TIME ZONE tz,
         ARRAY(
           SELECT w.id FROM itap.work_schedules w
           WHERE w.organization_id = org AND itap.in_windows(w.windows, w.timezone, p_at)
           ORDER BY w.id
         ),
         active;
END;
$$;
