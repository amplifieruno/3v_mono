-- Console support for the notification delivery log (read by org_admin through the existing select permission):
-- * notification_deliveries.to_me: the delivery is addressed to the session user (the console's "Mine" view),
--   compared through itap.session_user_id like the other "me" fields; false for a session without a valid user id.
-- * notification_deliveries.origin: what sent it, from the exactly-one origin columns
--   (notification_deliveries_exactly_one_origin): rule, escalation, subscription or report.
-- * notification_deliveries.title: the rendered title of its content (content ->> 'title'), for lists.
-- * notification_deliveries.escalation_policy_id: the policy of its escalation step (NULL for other origins), so the
--   log can link the policy; a step has no page of its own.
CREATE FUNCTION itap.notification_delivery_to_me(delivery_row itap.notification_deliveries, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(delivery_row.recipient_user_id = itap.session_user_id(hasura_session), false);
$$;

CREATE FUNCTION itap.notification_delivery_origin(delivery_row itap.notification_deliveries) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN delivery_row.rule_id IS NOT NULL THEN 'rule'
    WHEN delivery_row.escalation_step_id IS NOT NULL THEN 'escalation'
    WHEN delivery_row.subscription_id IS NOT NULL THEN 'subscription'
    WHEN delivery_row.report_id IS NOT NULL THEN 'report'
  END;
$$;

CREATE FUNCTION itap.notification_delivery_title(delivery_row itap.notification_deliveries) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(delivery_row.content ->> 'title', '');
$$;

CREATE FUNCTION itap.notification_delivery_escalation_policy_id(delivery_row itap.notification_deliveries) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT s.policy_id FROM itap.escalation_policy_steps s
  WHERE s.organization_id = delivery_row.organization_id AND s.id = delivery_row.escalation_step_id;
$$;
