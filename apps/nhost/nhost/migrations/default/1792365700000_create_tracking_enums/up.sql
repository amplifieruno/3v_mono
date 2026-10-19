-- Enums of the tracking state (spec §6.8).
CREATE TABLE itap.tracking_session_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.tracking_session_statuses (value, description) VALUES
  ('active', 'Person is currently tracked in the facility'),
  ('completed', 'Ended after the person was last seen at an entry/exit access point'),
  ('lost', 'Ended by timeout without passing an entry/exit access point'),
  ('error', 'Ended by an error');

CREATE TABLE itap.movement_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.movement_types (value, description) VALUES
  ('entry', 'Entered (first location of a session or an inbound access point)'),
  ('exit', 'Left through an outbound access point'),
  ('movement', 'Moved to another area or passed a two-way access point'),
  ('stationary', 'Stayed in place (estimated locations)');
