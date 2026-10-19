-- Report completion and schedule runs (see *_create_report_generation for the whole flow).
--   complete_report(report, attempt, file, summary): the claimed attempt only (else no row: the caller deletes its
--     file) -> completed + file; event report_generated (emit_event, dedup per report); an incident report logs
--     `report_generated` on its incident; a schedule report gets one delivery per member of the schedule's recipient
--     group on the schedule's channel (email pending -> send_delivery; in_app delivered + inbox row; low priority;
--     vacation delegates as in Stage C); then Stage C of the event (rules, subscriptions, webhooks).
--     Lock order: report row -> event key -> report deliveries -> Stage C (its own order).
--   init_report_schedule / run_report_schedule: see the generation migration.

CREATE FUNCTION itap.report_delivery_content(r itap.reports) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'subject', 'Report ready: ' || r.title,
    'title', left('Report ready: ' || r.title, 500),
    'body', r.title || ' (' || r.code || ', ' || upper(r.format)
            || coalesce(', ' || to_char(r.start_date, 'YYYY-MM-DD') || ' - ' || to_char(r.end_date, 'YYYY-MM-DD'), '')
            || ') is ready under Reports.',
    'report_code', r.code,
    'report_id', r.id,
    'file_id', r.file_id);
$$;

CREATE FUNCTION itap.complete_report(p_report uuid, p_attempt integer, p_file uuid, p_summary jsonb)
RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
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
  SET status = 'completed', file_id = p_file, summary = p_summary, generated_at = now(), error = NULL,
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
$$;

CREATE FUNCTION itap.init_report_schedule(p_schedule uuid, p_next_run_at timestamptz) RETURNS SETOF itap.report_schedules
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.report_schedules SET next_run_at = p_next_run_at
  WHERE id = p_schedule AND is_active AND next_run_at IS NULL
  RETURNING *;
$$;

CREATE FUNCTION itap.run_report_schedule(p_schedule uuid, p_run_at timestamptz, p_next_run_at timestamptz)
RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.report_schedules;
  t itap.report_templates;
  p record;
  r itap.reports;
BEGIN
  SELECT * INTO s FROM itap.report_schedules WHERE id = p_schedule FOR UPDATE;
  IF NOT FOUND OR NOT s.is_active OR s.next_run_at IS DISTINCT FROM p_run_at THEN
    RETURN;
  END IF;
  SELECT * INTO t FROM itap.report_templates WHERE organization_id = s.organization_id AND id = s.template_id;
  SELECT * INTO p FROM itap.report_period(coalesce(t.parameters ->> 'period', 'previous_day'), s.timezone, p_run_at);
  INSERT INTO itap.reports (organization_id, report_type, title, parameters, start_date, end_date, format, template_id,
                            schedule_id)
  VALUES (s.organization_id, t.report_type,
          s.name || ' ' || to_char(p.start_date, 'YYYY-MM-DD')
            || CASE WHEN p.end_date <> p.start_date THEN ' - ' || to_char(p.end_date, 'YYYY-MM-DD') ELSE '' END,
          t.parameters || jsonb_build_object('timezone', s.timezone), p.start_date, p.end_date, t.format, t.id, s.id)
  ON CONFLICT (organization_id, schedule_id, start_date, end_date) WHERE schedule_id IS NOT NULL DO NOTHING
  RETURNING * INTO r;
  UPDATE itap.report_schedules SET last_run_at = p_run_at, next_run_at = p_next_run_at WHERE id = s.id;
  IF r.id IS NOT NULL THEN
    RETURN NEXT r;
  END IF;
END;
$$;

