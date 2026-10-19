CREATE TABLE itap.profile_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.profile_types (value, description) VALUES
  ('employee', 'Employee'),
  ('visitor', 'Visitor'),
  ('contractor', 'Contractor'),
  ('vip', 'VIP');

CREATE TABLE itap.profile_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.profile_statuses (value, description) VALUES
  ('active', 'Active'),
  ('inactive', 'Inactive'),
  ('suspended', 'Suspended'),
  ('terminated', 'Terminated');

CREATE TABLE itap.access_levels (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_levels (value, description) VALUES
  ('basic', 'Basic access'),
  ('standard', 'Standard access'),
  ('elevated', 'Elevated access'),
  ('admin', 'Administrative access');
