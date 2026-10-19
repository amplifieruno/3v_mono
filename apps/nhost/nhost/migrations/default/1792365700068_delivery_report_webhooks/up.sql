-- delivery_report, fix round 1 (task 5):
--   * the webhook channel row also counts webhook_deliveries created in the period (webhook subscriptions, spec
--     §8.4): total, pending (pending + retrying), sent, failed, dead_letter; they have no acknowledgement and no
--     escalation. Group members on the webhook channel (notification_deliveries) are counted there as before.
--   * total no longer counts digest items (status digested): each is also counted by the combined delivery that
--     carried it. The digested column still shows how many items were combined.
CREATE OR REPLACE FUNCTION itap.delivery_report(hasura_session json, p_from timestamptz, p_to timestamptz)
RETURNS SETOF itap_results.delivery_report_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.session_user_id(hasura_session);
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    PERFORM itap.raise_code('report_period_invalid');
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT d.channel, d.status, d.acknowledged_at, d.created_at, d.escalation_step_id IS NOT NULL AS escalation
    FROM itap.notification_deliveries d
    WHERE d.organization_id = org AND d.created_at >= p_from AND d.created_at < p_to
      AND (d.subscription_id IS NULL OR d.recipient_user_id = me)
    UNION ALL
    SELECT 'webhook', w.status, NULL::timestamptz, w.created_at, false
    FROM itap.webhook_deliveries w
    WHERE w.organization_id = org AND w.created_at >= p_from AND w.created_at < p_to
  )
  SELECT org, c.value,
         (count(*) FILTER (WHERE r.status IS NOT NULL AND r.status <> 'digested'))::integer,
         (count(*) FILTER (WHERE r.status IN ('pending', 'retrying')))::integer,
         (count(*) FILTER (WHERE r.status = 'sent'))::integer,
         (count(*) FILTER (WHERE r.status = 'delivered'))::integer,
         (count(*) FILTER (WHERE r.status = 'failed'))::integer,
         (count(*) FILTER (WHERE r.status = 'dead_letter'))::integer,
         (count(*) FILTER (WHERE r.status = 'digested'))::integer,
         (count(*) FILTER (WHERE r.acknowledged_at IS NOT NULL))::integer,
         CASE WHEN c.value = 'in_app' AND count(*) FILTER (WHERE r.status = 'delivered') > 0 THEN
           round((count(*) FILTER (WHERE r.status = 'delivered' AND r.acknowledged_at IS NOT NULL))::numeric
                 / count(*) FILTER (WHERE r.status = 'delivered'), 4)
         END,
         CASE WHEN c.value = 'in_app' THEN
           round((avg(extract(epoch FROM r.acknowledged_at - r.created_at)) FILTER (WHERE r.acknowledged_at IS NOT NULL))::numeric, 1)
         END,
         (count(*) FILTER (WHERE r.escalation))::integer
  FROM itap.notification_channels c
  LEFT JOIN scoped r ON r.channel = c.value
  GROUP BY c.value
  ORDER BY c.value;
END;
$$;
