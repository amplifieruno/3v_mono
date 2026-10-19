-- Restores the task-3 sending state: no digests, digested items back to delivered (log only).
DROP FUNCTION itap.send_digests(uuid, timestamptz);

CREATE OR REPLACE FUNCTION itap.write_event_delivery(
  p_event itap.events, p_incident uuid, p_origin text, p_origin_id uuid, p_user uuid, p_address text, p_channel text,
  p_priority text, p_template uuid, p_digest text, p_vars jsonb, p_tz text
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_app constant boolean := p_channel = 'in_app';
  quiet jsonb;
  v_locale text;
  quiet_end timestamptz;
  deliver_at timestamptz;
  v_content jsonb;
  new_id uuid;
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT m.quiet_hours INTO quiet FROM itap.organization_members m
    WHERE m.organization_id = p_event.organization_id AND m.user_id = p_user;
    SELECT s.locale INTO v_locale FROM itap.user_settings s WHERE s.user_id = p_user;
  END IF;
  v_content := itap.notification_content(p_event.organization_id, p_template, p_channel, v_locale, p_vars);
  IF NOT in_app THEN
    IF quiet IS NOT NULL AND p_priority <> 'critical' THEN
      quiet_end := itap.windows_end(quiet, p_tz, p_event.occurred_at);
      IF quiet_end > p_event.occurred_at THEN
        deliver_at := quiet_end;
      END IF;
    END IF;
    IF p_digest = 'hourly' THEN
      deliver_at := greatest(deliver_at, date_trunc('hour', p_event.occurred_at) + interval '1 hour');
      v_content := v_content || jsonb_build_object('digest', p_digest);
    ELSIF p_digest = 'daily' THEN
      deliver_at := greatest(deliver_at, (((p_event.occurred_at AT TIME ZONE p_tz)::date + 1)::timestamp AT TIME ZONE p_tz));
      v_content := v_content || jsonb_build_object('digest', p_digest);
    END IF;
  END IF;

  INSERT INTO itap.notification_deliveries (
    organization_id, rule_id, subscription_id, event_id, incident_id, recipient_user_id, recipient_address, channel,
    priority, status, deliver_after, content, sent_at, delivered_at
  ) VALUES (
    p_event.organization_id,
    CASE WHEN p_origin = 'rule' THEN p_origin_id END,
    CASE WHEN p_origin = 'subscription' THEN p_origin_id END,
    p_event.id, p_incident, p_user, CASE WHEN p_user IS NULL THEN p_address END, p_channel, p_priority,
    CASE WHEN in_app THEN 'delivered' ELSE 'pending' END,
    deliver_at, v_content,
    CASE WHEN in_app THEN now() END, CASE WHEN in_app THEN now() END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NOT NULL AND in_app AND p_user IS NOT NULL THEN
    INSERT INTO itap.user_notifications (organization_id, user_id, delivery_id, event_id, incident_id, title, body, priority)
    VALUES (p_event.organization_id, p_user, new_id, p_event.id, p_incident, v_content ->> 'title',
            coalesce(v_content ->> 'body', ''), p_priority)
    ON CONFLICT (organization_id, delivery_id) DO NOTHING;
  END IF;
END;
$$;

ALTER TABLE itap.notification_deliveries DISABLE TRIGGER notification_deliveries_guard;
ALTER TABLE itap.notification_deliveries DROP CONSTRAINT notification_deliveries_digested_consistent;
UPDATE itap.notification_deliveries SET status = 'delivered' WHERE status = 'digested';
ALTER TABLE itap.notification_deliveries ENABLE TRIGGER notification_deliveries_guard;
ALTER TABLE itap.notification_deliveries DROP COLUMN digested_into;
DELETE FROM itap.notification_delivery_statuses WHERE value = 'digested';

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content'
  ];
BEGIN
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable)
     OR (OLD.content - 'scheduled_for') IS DISTINCT FROM (NEW.content - 'scheduled_for')
     OR (OLD.content ? 'scheduled_for' AND OLD.content -> 'scheduled_for' IS DISTINCT FROM NEW.content -> 'scheduled_for') THEN
    PERFORM itap.raise_code('notification_delivery_immutable');
  END IF;
  IF NOT itap.notification_delivery_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('notification_delivery_invalid_transition');
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    PERFORM itap.raise_code('notification_delivery_already_acknowledged');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.notification_delivery_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT p_from = p_to OR CASE p_from
    WHEN 'pending' THEN p_to IN ('sent', 'delivered', 'failed', 'retrying', 'dead_letter')
    WHEN 'retrying' THEN p_to IN ('sent', 'delivered', 'failed', 'dead_letter')
    WHEN 'failed' THEN p_to IN ('retrying', 'dead_letter')
    WHEN 'sent' THEN p_to IN ('delivered', 'failed')
    ELSE false
  END;
$$;
