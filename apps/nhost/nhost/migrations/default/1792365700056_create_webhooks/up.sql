-- Webhooks (spec §6.12, §8.4): org-managed subscriptions to event types, and one signed delivery per (subscription,
-- event) written by Stage C (itap.fan_out_event) and sent by the send_webhook event trigger / retry_webhooks cron.
CREATE TABLE itap.webhook_delivery_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.webhook_delivery_statuses (value, description) VALUES
  ('pending', 'Waiting for the first attempt'),
  ('sent', 'The endpoint answered 2xx'),
  ('failed', 'Not sent and not retried (subscription inactive, blocked address)'),
  ('retrying', 'An attempt failed; another is scheduled at next_attempt_at'),
  ('dead_letter', 'Given up after the last attempt');

-- A deliverable webhook URL: http(s), a host, no credentials (userinfo), at most 2048 characters, and not a
-- link-local / cloud metadata address (169.254.0.0/16, fe80::/10, 0.0.0.0). Private ranges stay allowed (demo:
-- the dev sink is http://backend:3001). The sender re-checks the resolved address (DNS) before each attempt.
CREATE FUNCTION itap.valid_webhook_url(p_url text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  authority text;
  host text;
BEGIN
  IF p_url IS NULL OR length(p_url) > 2048 OR p_url !~* '^https?://[^\s/?#]+([/?#]\S*)?$' THEN
    RETURN false;
  END IF;
  authority := substring(p_url FROM '^[A-Za-z]+://([^/?#]+)');
  IF position('@' IN authority) > 0 THEN
    RETURN false;
  END IF;
  host := lower(CASE WHEN authority LIKE '[%' THEN substring(authority FROM '^\[([^\]]*)\]') ELSE split_part(authority, ':', 1) END);
  IF host IS NULL OR host = '' OR host ~ '^169\.254\.' OR host ~ '^0+\.0+\.0+\.0+$' OR host ~ '^fe[89ab][0-9a-f]:'
     OR host ~ '^::ffff:169\.254\.' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE TABLE itap.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  last_delivery_status text REFERENCES itap.webhook_delivery_statuses (value),
  last_delivery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_subscriptions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT webhook_subscriptions_url_valid CHECK (itap.valid_webhook_url(url)),
  CONSTRAINT webhook_subscriptions_secret_length CHECK (length(secret) BETWEEN 16 AND 256)
);
CREATE INDEX webhook_subscriptions_organization_id_last_delivery_status_idx
  ON itap.webhook_subscriptions (organization_id, last_delivery_status);
CREATE TRIGGER webhook_subscriptions_set_updated_at BEFORE UPDATE ON itap.webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at_except('last_delivery_status', 'last_delivery_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret', 'ignore:last_delivery_status', 'ignore:last_delivery_at');

CREATE TABLE itap.webhook_subscription_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  event_type text NOT NULL REFERENCES itap.event_types (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_subscription_event_types_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT webhook_subscription_event_types_organization_id_subscription_id_event_type_key
    UNIQUE (organization_id, subscription_id, event_type),
  CONSTRAINT webhook_subscription_event_types_subscription_fkey FOREIGN KEY (organization_id, subscription_id)
    REFERENCES itap.webhook_subscriptions (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX webhook_subscription_event_types_organization_id_event_type_idx
  ON itap.webhook_subscription_event_types (organization_id, event_type);
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.webhook_subscription_event_types
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- One delivery per (subscription, event); read-only log, not audited (high volume). body is the JSON payload built
-- at fan-out, so every attempt POSTs (and signs) the same bytes. event_id is a plain log link (spec §4.1). A
-- subscription's deliveries are its log: a hard delete of the subscription removes them (deactivate to keep them).
-- next_attempt_at: the earliest next attempt (backoff after a failure; a short lease while an attempt is in flight).
CREATE TABLE itap.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' REFERENCES itap.webhook_delivery_statuses (value),
  attempts integer NOT NULL DEFAULT 0,
  response_code integer,
  signature text,
  sent_at timestamptz,
  next_attempt_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT webhook_deliveries_subscription_event_key UNIQUE (organization_id, subscription_id, event_id),
  CONSTRAINT webhook_deliveries_attempts_nonnegative CHECK (attempts >= 0),
  CONSTRAINT webhook_deliveries_body_object CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT webhook_deliveries_subscription_fkey FOREIGN KEY (organization_id, subscription_id)
    REFERENCES itap.webhook_subscriptions (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX webhook_deliveries_organization_id_event_id_idx ON itap.webhook_deliveries (organization_id, event_id);
CREATE INDEX webhook_deliveries_organization_id_status_idx ON itap.webhook_deliveries (organization_id, status);
CREATE INDEX webhook_deliveries_organization_id_created_at_idx ON itap.webhook_deliveries (organization_id, created_at DESC);
-- Due work for the retry_webhooks cron.
CREATE INDEX webhook_deliveries_due_idx ON itap.webhook_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying');

-- Allowed status changes (same status = another attempt):
--   pending, retrying -> sent | failed | retrying | dead_letter
--   failed            -> retrying | dead_letter
--   sent, dead_letter: terminal
CREATE FUNCTION itap.webhook_delivery_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT p_from = p_to OR CASE p_from
    WHEN 'pending' THEN p_to IN ('sent', 'failed', 'retrying', 'dead_letter')
    WHEN 'retrying' THEN p_to IN ('sent', 'failed', 'dead_letter')
    WHEN 'failed' THEN p_to IN ('retrying', 'dead_letter')
    ELSE false
  END;
$$;

CREATE FUNCTION itap.guard_webhook_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY['status', 'attempts', 'response_code', 'signature', 'sent_at', 'next_attempt_at', 'error'];
BEGIN
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    PERFORM itap.raise_code('webhook_delivery_immutable');
  END IF;
  IF NOT itap.webhook_delivery_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('webhook_delivery_invalid_transition');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_deliveries_guard BEFORE UPDATE ON itap.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION itap.guard_webhook_delivery();
