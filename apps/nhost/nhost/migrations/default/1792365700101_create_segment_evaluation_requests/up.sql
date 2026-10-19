-- Debounced segment evaluation on input changes (slice 6 task 3; replaces the spec's `segment_inputs_changed` event
-- trigger, spec §8.4). A write to an input of the condition language requests an evaluation of its organization:
-- one row per organization, renewed at commit. The 1-minute cron `evaluate_segments_pending` evaluates the dynamic
-- segments of every organization whose first unprocessed request is at least 30 s old (several writes, one
-- evaluation), then marks the request processed unless it was renewed meanwhile.
--
-- requested_at        latest request (strictly increasing; renewed by every requesting transaction)
-- first_requested_at  first request since the last processing: the debounce window start
-- last_processed_at   the requested_at value the last finished processing consumed; pending = requested_at > it
--
-- Requests are written by deferred constraint triggers, i.e. at commit: the per-organization row lock is taken last
-- in the writing transaction (no lock-order hazards with the writer's other row locks) and held only while it commits.
-- The processor finishes with `requested_at = <value it read>`, which waits for a committing writer's lock and then
-- sees the renewed value, so a write committed after the evaluation read stays pending.
--
-- Inputs (field catalog, itap.segment_field_catalog, and the translator): profiles (columns, custom fields, company,
-- work schedule, has_face via identities_count), identities (status, profile link, attributes; not the detection
-- counters: behavioral metrics change through the hourly evaluate_segments after refresh_activity_stats),
-- watch_list_entries (is_blacklisted), visits (visit_status_today), work_schedules (on_shift_now), MANUAL
-- segment_members (member_of_segment; rule rows are the evaluator's own output and never request), and the segment
-- definition (conditions, status, active window, schedule; not member_count / last_evaluated_at, which the evaluator
-- writes). Detections never request.
CREATE TABLE itap.segment_evaluation_requests (
  organization_id uuid PRIMARY KEY REFERENCES itap.organizations (id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL,
  first_requested_at timestamptz NOT NULL,
  last_processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segment_evaluation_requests_window_ordered CHECK (first_requested_at <= requested_at)
);

-- Upserts the request of p_organization (at most once per transaction and organization).
CREATE FUNCTION itap.request_segment_evaluation(p_organization uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  flag constant text := 'itap.segment_request_' || replace(p_organization::text, '-', '');
  ts constant timestamptz := clock_timestamp();
BEGIN
  IF p_organization IS NULL OR coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN;
  END IF;
  -- Organization being deleted (cascade): nothing to evaluate.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = p_organization) THEN
    RETURN;
  END IF;
  INSERT INTO itap.segment_evaluation_requests AS r (organization_id, requested_at, first_requested_at)
  VALUES (p_organization, ts, ts)
  ON CONFLICT (organization_id) DO UPDATE SET
    requested_at = greatest(EXCLUDED.requested_at, r.requested_at + interval '1 microsecond'),
    first_requested_at = CASE
      WHEN r.last_processed_at IS NULL OR r.requested_at > r.last_processed_at THEN r.first_requested_at
      ELSE greatest(EXCLUDED.requested_at, r.requested_at + interval '1 microsecond')
    END;
  PERFORM set_config(flag, 'on', true);
END;
$$;

-- Deferred row trigger on the inputs: requests an evaluation of the row's organization at commit.
CREATE FUNCTION itap.segment_inputs_changed() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.request_segment_evaluation(CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR UPDATE OR DELETE ON itap.profiles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();

CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR DELETE ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();
CREATE CONSTRAINT TRIGGER segment_inputs_changed_update AFTER UPDATE ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.profile_id IS DISTINCT FROM NEW.profile_id
        OR OLD.attributes IS DISTINCT FROM NEW.attributes)
  EXECUTE FUNCTION itap.segment_inputs_changed();

CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR UPDATE OR DELETE ON itap.watch_list_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();
CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR UPDATE OR DELETE ON itap.visits
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();
CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR UPDATE OR DELETE ON itap.work_schedules
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();

-- Manual membership rows only (member_of_segment refers to manual segments; a manual pin on a dynamic segment requests
-- too, harmlessly). Rule rows are the evaluator's own output and never request: no self-retrigger.
CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT OR UPDATE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.source = 'manual')
  EXECUTE FUNCTION itap.segment_inputs_changed();
CREATE CONSTRAINT TRIGGER segment_inputs_changed_delete AFTER DELETE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.source = 'manual')
  EXECUTE FUNCTION itap.segment_inputs_changed();

CREATE CONSTRAINT TRIGGER segment_inputs_changed AFTER INSERT ON itap.segments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.segment_inputs_changed();
CREATE CONSTRAINT TRIGGER segment_inputs_changed_update AFTER UPDATE ON itap.segments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.conditions IS DISTINCT FROM NEW.conditions OR OLD.status IS DISTINCT FROM NEW.status
        OR OLD.active_from IS DISTINCT FROM NEW.active_from OR OLD.active_until IS DISTINCT FROM NEW.active_until
        OR OLD.schedule IS DISTINCT FROM NEW.schedule)
  EXECUTE FUNCTION itap.segment_inputs_changed();

-- Organizations whose first unprocessed request is at least 30 s old at p_at (cron evaluate_segments_pending).
CREATE FUNCTION itap.due_segment_evaluations(p_at timestamptz) RETURNS SETOF itap.segment_evaluation_requests
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT r.* FROM itap.segment_evaluation_requests r
  WHERE (r.last_processed_at IS NULL OR r.requested_at > r.last_processed_at)
    AND r.first_requested_at <= p_at - interval '30 seconds'
  ORDER BY r.first_requested_at, r.organization_id;
$$;

-- Marks the request processed when it was not renewed since the processor read p_requested_at; returns the row when
-- it did, nothing otherwise (the organization stays pending for the next run).
CREATE FUNCTION itap.finish_segment_evaluation_request(p_organization uuid, p_requested_at timestamptz)
RETURNS SETOF itap.segment_evaluation_requests
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.segment_evaluation_requests r SET last_processed_at = r.requested_at
  WHERE r.organization_id = p_organization AND r.requested_at = p_requested_at
  RETURNING r.*;
$$;
