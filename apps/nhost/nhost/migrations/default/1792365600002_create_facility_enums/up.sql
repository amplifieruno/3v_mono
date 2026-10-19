CREATE TABLE itap.facility_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.facility_statuses (value, description) VALUES
  ('active', 'Active'),
  ('inactive', 'Inactive'),
  ('maintenance', 'Under maintenance');

CREATE TABLE itap.area_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.area_types (value, description) VALUES
  ('building', 'Building'),
  ('floor', 'Floor'),
  ('zone', 'Zone'),
  ('room', 'Room'),
  ('sector', 'Sector'),
  ('entrance', 'Entrance'),
  ('corridor', 'Corridor'),
  ('parking', 'Parking'),
  ('virtual_zone', 'Virtual zone (geofence)');

-- Ordered: public < restricted < secure < classified (rank function arrives with access control, spec §6.0).
CREATE TABLE itap.area_access_levels (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.area_access_levels (value, description) VALUES
  ('public', 'Public'),
  ('restricted', 'Restricted'),
  ('secure', 'Secure'),
  ('classified', 'Classified');

CREATE TABLE itap.area_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.area_statuses (value, description) VALUES
  ('active', 'Active'),
  ('inactive', 'Inactive'),
  ('maintenance', 'Under maintenance');
