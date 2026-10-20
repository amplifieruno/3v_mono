-- Slice 10 task 2 fix round 1: the seed back-dated report_generated events with an UPDATE of itap.events, which the
-- append-only guard now refuses. Instead the seed completes its past reports through the seed-only
-- itap.seed_complete_report(..., p_at): under itap.seed_context with the transaction-local itap.seed_report_at,
-- complete_report stamps generated_at (and so the event's occurred_at) with the planned time. Live completion is
-- unchanged (now()). The append-only guard is not widened.
CREATE OR REPLACE FUNCTION itap.complete_report(p_report uuid, p_attempt integer, p_file uuid, p_summary jsonb)
 RETURNS SETOF itap.reports
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  r itap.reports;
  s itap.report_schedules;
  ev itap.events;
  ev_id uuid;
  fresh boolean;
  target record;
  delivery uuid;
  content jsonb;
BEGIN
  SELECT * INTO r FROM itap.reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND OR r.status <> 'generating' OR r.attempts <> p_attempt THEN
    RETURN;
  END IF;
  UPDATE itap.reports
  SET status = 'completed', file_id = p_file, summary = p_summary,
      generated_at = coalesce(CASE WHEN itap.seed_context()
                                   THEN nullif(current_setting('itap.seed_report_at', true), '')::timestamptz END, now()),
      error = NULL,
      lease_expires_at = NULL
  WHERE id = r.id
  RETURNING * INTO r;

  ev.organization_id := r.organization_id;
  ev.event_type := 'report_generated';
  ev.severity := 'info';
  ev.facility_id := CASE
    WHEN r.incident_id IS NOT NULL THEN (SELECT i.facility_id FROM itap.incidents i
                                        WHERE i.organization_id = r.organization_id AND i.id = r.incident_id)
    ELSE (SELECT min(x.facility_id::text)::uuid FROM itap.report_facilities x
          WHERE x.organization_id = r.organization_id AND x.report_id = r.id
          HAVING count(*) = 1)
  END;
  ev.title := 'Report generated: ' || r.code || ' ' || r.title;
  ev.payload := jsonb_build_object(
    'report_id', r.id, 'code', r.code, 'report_type', r.report_type, 'format', r.format, 'title', r.title,
    'schedule_id', r.schedule_id, 'incident_id', r.incident_id, 'file_id', r.file_id,
    'start_date', r.start_date, 'end_date', r.end_date);
  ev.dedup_key := 'report:' || r.id || ':report_generated';
  ev.occurred_at := r.generated_at;
  ev_id := itap.emit_event(ev);
  fresh := ev_id IS NOT NULL;
  IF NOT fresh THEN
    SELECT e.id INTO ev_id FROM itap.events e WHERE e.organization_id = r.organization_id AND e.dedup_key = ev.dedup_key;
  END IF;

  IF r.incident_id IS NOT NULL THEN
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details, occurred_at)
    VALUES (r.organization_id, r.incident_id, r.created_by, 'report_generated',
            jsonb_build_object('report_id', r.id, 'code', r.code, 'format', r.format), r.generated_at);
  END IF;

  IF r.schedule_id IS NOT NULL THEN
    SELECT * INTO s FROM itap.report_schedules x WHERE x.organization_id = r.organization_id AND x.id = r.schedule_id;
    IF FOUND AND s.channel IN ('email', 'in_app') AND s.recipient_group_id IS NOT NULL THEN
      content := itap.report_delivery_content(r);
      FOR target IN
        SELECT gm.external_address,
               CASE WHEN gm.user_id IS NOT NULL
                    THEN itap.notification_recipient(r.organization_id, gm.user_id, r.generated_at, true) END AS user_id
        FROM itap.recipient_group_members gm
        WHERE gm.organization_id = r.organization_id AND gm.group_id = s.recipient_group_id AND gm.channel = s.channel
        ORDER BY gm.id
      LOOP
        CONTINUE WHEN target.user_id IS NULL AND target.external_address IS NULL;
        delivery := NULL;
        INSERT INTO itap.notification_deliveries (
          organization_id, report_id, event_id, recipient_user_id, recipient_address, channel, priority, status,
          content, sent_at, delivered_at
        ) VALUES (
          r.organization_id, r.id, ev_id, target.user_id, CASE WHEN target.user_id IS NULL THEN target.external_address END,
          s.channel, 'low', CASE WHEN s.channel = 'in_app' THEN 'delivered' ELSE 'pending' END, content,
          CASE WHEN s.channel = 'in_app' THEN now() END, CASE WHEN s.channel = 'in_app' THEN now() END
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO delivery;
        IF delivery IS NOT NULL AND s.channel = 'in_app' AND target.user_id IS NOT NULL THEN
          INSERT INTO itap.user_notifications (organization_id, user_id, delivery_id, event_id, title, body, priority)
          VALUES (r.organization_id, target.user_id, delivery, ev_id, content ->> 'title', content ->> 'body', 'low')
          ON CONFLICT (organization_id, delivery_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF fresh THEN
    PERFORM itap.finish_events(r.organization_id, ARRAY[ev_id]);
  END IF;
  RETURN NEXT r;
END;
$function$

;

CREATE FUNCTION itap.seed_complete_report(p_report uuid, p_attempt integer, p_file uuid, p_summary jsonb, p_at timestamptz)
RETURNS SETOF itap.reports
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  prev_seed text := coalesce(current_setting('itap.seed_context', true), '');
BEGIN
  IF p_at IS NULL OR p_at > now() THEN
    PERFORM itap.raise_code('seed_report_at_invalid');
  END IF;
  PERFORM set_config('itap.seed_context', 'on', true);
  PERFORM set_config('itap.seed_report_at', p_at::text, true);
  RETURN QUERY SELECT * FROM itap.complete_report(p_report, p_attempt, p_file, p_summary);
  PERFORM set_config('itap.seed_report_at', '', true);
  PERFORM set_config('itap.seed_context', coalesce(nullif(prev_seed, ''), 'off'), true);
END;
$$;
