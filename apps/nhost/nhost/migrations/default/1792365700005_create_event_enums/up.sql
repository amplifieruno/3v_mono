-- Event vocabulary (spec §6.9): severities (an ordered enum, compared only through itap.severity_rank, spec §6.0)
-- and the full event type list. Every type has a producer in spec §8.
CREATE TABLE itap.event_severities (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.event_severities (value, description) VALUES
  ('info', 'Informational'),
  ('low', 'Low'),
  ('medium', 'Medium'),
  ('high', 'High'),
  ('critical', 'Critical');

-- Rank of a severity on the 1..5 scale; NULL for an unknown value. Comparisons of severities always go through it.
CREATE FUNCTION itap.severity_rank(p_severity text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_severity
    WHEN 'info' THEN 1
    WHEN 'low' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'high' THEN 4
    WHEN 'critical' THEN 5
  END;
$$;

CREATE TABLE itap.event_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.event_types (value, description) VALUES
  ('detection_unknown', 'Unknown person detected (session opened)'),
  ('detection_known', 'Known person detected (session opened)'),
  ('watchlist_match', 'Person on a watch list detected'),
  ('blacklist_match', 'Person on a blacklist detected'),
  ('vip_arrival', 'VIP arrived'),
  ('inactive_profile_detected', 'Suspended or terminated profile detected'),
  ('restricted_area_entry', 'Entry into an area above the person''s clearance'),
  ('access_granted', 'Access granted at an access point'),
  ('access_denied', 'Access denied at an access point'),
  ('tailgating', 'More people passed than access was granted to'),
  ('loitering', 'Person stayed in an area longer than its loitering threshold'),
  ('unusual_dwell', 'Unusually long stay in an area'),
  ('after_hours', 'Presence outside facility operating hours'),
  ('unexpected_facility', 'Known person seen in a facility for the first time'),
  ('abnormal_movement', 'Area transition not seen before'),
  ('occupancy_exceeded', 'Area occupancy above capacity'),
  ('device_offline', 'Device went offline'),
  ('device_online', 'Device came back online'),
  ('device_error', 'Device reported an error'),
  ('auth_success', 'Face authentication succeeded'),
  ('auth_failed', 'Face authentication failed'),
  ('emergency_override_started', 'Emergency override started'),
  ('emergency_override_ended', 'Emergency override ended'),
  ('saved_search_match', 'Scheduled saved search found matches'),
  ('integration_failed', 'Integration sync failed'),
  ('admin_action', 'Administrative action');
