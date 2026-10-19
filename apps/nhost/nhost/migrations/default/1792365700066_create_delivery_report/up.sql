-- Delivery report (spec §6.12, plan-05 task 5): notification volumes per channel of the session organization for
-- deliveries created in [p_from, p_to). Read model for org_admin; stores nothing.
-- One row per notification channel (all channels, zeros included), ordered by channel:
--   total                   every delivery of the channel in the period
--   pending                 pending + retrying (not yet settled)
--   sent / delivered / failed / dead_letter / digested   by status (email ends as sent: no delivery receipt)
--   acknowledged            deliveries with acknowledged_at
--   ack_rate                in_app only: acknowledged / delivered (4 decimals; NULL without delivered in_app rows)
--   avg_response_seconds    in_app only: mean of acknowledged_at - created_at over acknowledged rows (1 decimal)
--   escalations             deliveries written by an escalation step
-- Subscription deliveries are private (like their select permission): only the session user's own are counted.
-- p_from must be before p_to (else report_period_invalid); the session needs an organization (organization_required).
CREATE TABLE itap_results.delivery_report_rows (
  organization_id uuid NOT NULL,
  channel text NOT NULL,
  total integer NOT NULL,
  pending integer NOT NULL,
  sent integer NOT NULL,
  delivered integer NOT NULL,
  failed integer NOT NULL,
  dead_letter integer NOT NULL,
  digested integer NOT NULL,
  acknowledged integer NOT NULL,
  ack_rate numeric,
  avg_response_seconds numeric,
  escalations integer NOT NULL
);

CREATE FUNCTION itap.delivery_report(hasura_session json, p_from timestamptz, p_to timestamptz)
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
    SELECT d.channel, d.status, d.acknowledged_at, d.created_at, d.escalation_step_id
    FROM itap.notification_deliveries d
    WHERE d.organization_id = org AND d.created_at >= p_from AND d.created_at < p_to
      AND (d.subscription_id IS NULL OR d.recipient_user_id = me)
  )
  SELECT org, c.value,
         count(r.channel)::integer,
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
         (count(*) FILTER (WHERE r.escalation_step_id IS NOT NULL))::integer
  FROM itap.notification_channels c
  LEFT JOIN scoped r ON r.channel = c.value
  GROUP BY c.value
  ORDER BY c.value;
END;
$$;
