-- Notification vocabulary (spec §6.12): delivery channels and the priority scale of notification rules.
-- Priorities are an ordered enum compared only through itap.priority_rank (spec §6.0), like severities.
CREATE TABLE itap.notification_channels (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.notification_channels (value, description) VALUES
  ('in_app', 'In-app inbox'),
  ('email', 'Email'),
  ('sms', 'SMS'),
  ('push', 'Push notification'),
  ('webhook', 'Outgoing webhook');

CREATE TABLE itap.notification_priorities (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.notification_priorities (value, description) VALUES
  ('low', 'Low'),
  ('medium', 'Medium'),
  ('high', 'High'),
  ('critical', 'Critical: never deferred by quiet hours');

CREATE TABLE itap.notification_digest_modes (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.notification_digest_modes (value, description) VALUES
  ('none', 'Send immediately'),
  ('hourly', 'Aggregate into an hourly digest'),
  ('daily', 'Aggregate into a daily digest');

-- Rank of a priority on the 1..4 scale; NULL for an unknown value.
CREATE FUNCTION itap.priority_rank(p_priority text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_priority
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high' THEN 3
    WHEN 'critical' THEN 4
  END;
$$;
