-- Segment enums (spec §6.5).
CREATE TABLE itap.segment_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.segment_kinds (value, description) VALUES
  ('manual', 'Members are added and removed by hand'),
  ('dynamic', 'Members are the subjects matching the conditions (plus any added by hand)');

CREATE TABLE itap.segment_targets (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.segment_targets (value, description) VALUES
  ('identities', 'Identities (known and unknown faces)'),
  ('profiles', 'Profiles (known people)');

CREATE TABLE itap.segment_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.segment_statuses (value, description) VALUES
  ('active', 'Evaluated and usable'),
  ('inactive', 'Kept but not evaluated'),
  ('archived', 'Retired; membership history kept');

CREATE TABLE itap.segment_member_sources (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.segment_member_sources (value, description) VALUES
  ('manual', 'Added by a person'),
  ('rule', 'Added by condition evaluation');
