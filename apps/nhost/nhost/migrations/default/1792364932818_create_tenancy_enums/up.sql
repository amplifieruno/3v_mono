CREATE TABLE itap.organization_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.organization_statuses (value, description) VALUES
  ('active', 'Active'),
  ('suspended', 'Suspended');

CREATE TABLE itap.member_roles (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.member_roles (value, description) VALUES
  ('admin', 'Administrator');

CREATE TABLE itap.member_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.member_statuses (value, description) VALUES
  ('active', 'Active'),
  ('suspended', 'Suspended'),
  ('deactivated', 'Deactivated');
