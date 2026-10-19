-- close_stale_sessions closes a session only when it has been idle longer than the tracking timeout plus 60 s
-- grace (cutoff = p_at - timeout - 60 s); everything else as in 1792365700022_create_tracking_crons.
CREATE OR REPLACE FUNCTION itap.close_stale_sessions(p_organization uuid, p_at timestamp with time zone)
 RETURNS SETOF itap.tracking_sessions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  timeout_seconds integer;
  cutoff timestamptz;
  candidate record;
  closed uuid[] := '{}';
BEGIN
  SELECT st.tracking_timeout_seconds INTO timeout_seconds
  FROM itap.organization_settings st WHERE st.organization_id = p_organization;
  -- 60 s grace past the timeout: a detection still in flight at p_at (recognition latency, Stage A waiting on the
  -- identity lock) extends its session instead of finding it closed and opening a new one.
  cutoff := p_at - make_interval(secs => coalesce(timeout_seconds, 300)) - interval '60 seconds';
  FOR candidate IN
    SELECT s.id, s.identity_id FROM itap.tracking_sessions s
    WHERE s.organization_id = p_organization AND s.status = 'active' AND s.last_detected_at < cutoff
    ORDER BY s.identity_id, s.id
  LOOP
    IF candidate.identity_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || candidate.identity_id::text, 0));
    END IF;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM itap.tracking_sessions s
      WHERE s.organization_id = p_organization AND s.id = candidate.id AND s.status = 'active' AND s.last_detected_at < cutoff
    );
    IF itap.close_tracking_session(p_organization, candidate.id) IS NOT NULL THEN
      closed := closed || candidate.id;
    END IF;
  END LOOP;
  RETURN QUERY
    SELECT * FROM itap.tracking_sessions s WHERE s.organization_id = p_organization AND s.id = ANY (closed)
    ORDER BY s.identity_id, s.id;
END;
$function$;
