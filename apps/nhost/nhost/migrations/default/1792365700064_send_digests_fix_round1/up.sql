-- Fix round 1 (task 4), send_digests:
--   * candidates are locked and collected by ONE statement (array_agg over a FOR UPDATE subquery, id order); only
--     those ids are processed;
--   * items whose recipient member is no longer active and unexpired at p_at become dead_letter with error
--     'recipient_inactive' (not digested; spec §4.2: deactivated members receive nothing);
--   * an item whose event is gone gets the window that ends at its deliver_after (deliver_after - 1 hour / 1 day).

CREATE OR REPLACE FUNCTION itap.send_digests(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.notification_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  tz text;
  g record;
  window_end timestamptz;
  rule_name text;
  lines text;
  subject text;
  combined itap.notification_deliveries;
  candidate_ids uuid[];
BEGIN
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = p_organization;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  tz := coalesce(tz, 'UTC');
  -- One statement locks the candidate items (blocking, id order) and collects their ids: a concurrent run waits
  -- here and then no longer sees them as pending. Only these ids are dead-lettered or grouped below.
  SELECT coalesce(array_agg(c.id), '{}') INTO candidate_ids
  FROM (
    SELECT d.id FROM itap.notification_deliveries d
    WHERE d.organization_id = p_organization AND d.status = 'pending' AND d.deliver_after <= p_at
      AND d.rule_id IS NOT NULL AND d.content ? 'digest'
    ORDER BY d.id
    FOR UPDATE
  ) c;
  IF cardinality(candidate_ids) = 0 THEN
    RETURN;
  END IF;

  -- Members no longer active (or expired) at p_at receive nothing (spec §4.2): their items end as dead_letter.
  UPDATE itap.notification_deliveries d SET status = 'dead_letter', error = 'recipient_inactive'
  WHERE d.organization_id = p_organization AND d.id = ANY (candidate_ids) AND d.recipient_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM itap.organization_members m
      WHERE m.organization_id = d.organization_id AND m.user_id = d.recipient_user_id
        AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > p_at)
    );

  FOR g IN
    WITH items AS (
      SELECT d.id, d.rule_id, d.recipient_key, d.recipient_user_id, d.recipient_address, d.channel, d.priority,
             d.event_id, d.incident_id, d.content ->> 'title' AS title, d.content ->> 'digest' AS period,
             coalesce(e.occurred_at, d.created_at) AS occurred_at,
             coalesce(CASE d.content ->> 'digest'
                        WHEN 'hourly' THEN date_trunc('hour', e.occurred_at, 'UTC')
                        WHEN 'daily' THEN date_trunc('day', e.occurred_at, tz)
                      END,
                      d.deliver_after - CASE d.content ->> 'digest' WHEN 'daily' THEN interval '1 day' ELSE interval '1 hour' END
             ) AS window_start
      FROM itap.notification_deliveries d
      LEFT JOIN itap.events e ON e.organization_id = d.organization_id AND e.id = d.event_id
      WHERE d.organization_id = p_organization AND d.id = ANY (candidate_ids) AND d.status = 'pending'
    )
    SELECT i.rule_id, i.recipient_user_id, i.recipient_address, i.channel, i.period, i.window_start,
           array_agg(i.id ORDER BY i.occurred_at, i.id) AS ids,
           (array_agg(i.priority ORDER BY itap.priority_rank(i.priority) DESC))[1] AS priority,
           count(*)::integer AS n,
           jsonb_agg(jsonb_build_object('delivery_id', i.id, 'event_id', i.event_id, 'incident_id', i.incident_id,
                                        'title', i.title, 'occurred_at', i.occurred_at)
                     ORDER BY i.occurred_at, i.id) AS items
    FROM items i
    GROUP BY i.rule_id, i.recipient_key, i.recipient_user_id, i.recipient_address, i.channel, i.period, i.window_start
    ORDER BY i.rule_id, i.recipient_key, i.channel, i.window_start
  LOOP
    window_end := CASE g.period
      WHEN 'hourly' THEN g.window_start + interval '1 hour'
      WHEN 'daily' THEN ((g.window_start AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz
      ELSE g.window_start + interval '1 hour'
    END;
    SELECT r.name INTO rule_name FROM itap.notification_rules r WHERE r.organization_id = p_organization AND r.id = g.rule_id;
    SELECT string_agg(
             '- ' || coalesce(x ->> 'title', '') || ' ('
               || to_char((x ->> 'occurred_at')::timestamptz AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI') || ')',
             E'\n' ORDER BY t.n)
      INTO lines
    FROM jsonb_array_elements(g.items) WITH ORDINALITY AS t (x, n)
    WHERE t.n <= 50;
    IF g.n > 50 THEN
      lines := lines || E'\n' || format('... and %s more', g.n - 50);
    END IF;
    subject := format('[Digest] %s: %s notification%s', rule_name, g.n, CASE WHEN g.n = 1 THEN '' ELSE 's' END);

    INSERT INTO itap.notification_deliveries (
      organization_id, rule_id, recipient_user_id, recipient_address, channel, priority, status, content
    ) VALUES (
      p_organization, g.rule_id, g.recipient_user_id, g.recipient_address, g.channel, g.priority, 'pending',
      jsonb_build_object(
        'template_id', NULL,
        'subject', subject,
        'title', left(subject, 500),
        'body', concat_ws(E'\n',
          format('%s digest, %s - %s (%s)', initcap(coalesce(g.period, 'digest')),
                 to_char(g.window_start AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI'),
                 to_char(coalesce(window_end, p_at) AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI'), tz),
          lines),
        'digest_period', g.period,
        'window_start', g.window_start,
        'window_end', window_end,
        'item_count', g.n,
        'items', (SELECT jsonb_agg(x ORDER BY t.n) FROM jsonb_array_elements(g.items) WITH ORDINALITY AS t (x, n) WHERE t.n <= 100)
      )
    )
    RETURNING * INTO combined;

    UPDATE itap.notification_deliveries SET status = 'digested', digested_into = combined.id
    WHERE organization_id = p_organization AND id = ANY (g.ids);
    RETURN NEXT combined;
  END LOOP;
END;
$$;
