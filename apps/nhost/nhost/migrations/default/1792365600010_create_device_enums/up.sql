CREATE TABLE itap.access_point_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_point_kinds (value, description) VALUES
  ('door', 'Door'),
  ('turnstile', 'Turnstile'),
  ('gate', 'Gate'),
  ('elevator', 'Elevator'),
  ('reception', 'Reception desk');

CREATE TABLE itap.access_point_directions (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_point_directions (value, description) VALUES
  ('in', 'Entry only'),
  ('out', 'Exit only'),
  ('both', 'Entry and exit');

CREATE TABLE itap.device_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.device_types (value, description) VALUES
  ('static_video_camera', 'Static video camera'),
  ('ptz_camera', 'PTZ camera'),
  ('thermal_camera', 'Thermal camera'),
  ('access_terminal', 'Access terminal'),
  ('sensor', 'Sensor');

CREATE TABLE itap.device_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.device_statuses (value, description) VALUES
  ('active', 'Active'),
  ('inactive', 'Inactive'),
  ('error', 'Error'),
  ('maintenance', 'Under maintenance'),
  ('connection_error', 'Connection error');

CREATE TABLE itap.device_health_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.device_health_statuses (value, description) VALUES
  ('healthy', 'Healthy'),
  ('warning', 'Warning'),
  ('critical', 'Critical'),
  ('unknown', 'Unknown');

CREATE TABLE itap.access_point_device_roles (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_point_device_roles (value, description) VALUES
  ('camera', 'Camera'),
  ('terminal', 'Access terminal'),
  ('sensor', 'Sensor');
