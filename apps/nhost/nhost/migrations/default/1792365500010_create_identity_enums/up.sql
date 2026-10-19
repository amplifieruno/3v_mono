CREATE TABLE itap.identity_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.identity_statuses (value, description) VALUES
  ('unverified', 'Not verified yet'),
  ('pending_verification', 'Waiting for verification'),
  ('verified', 'Verified'),
  ('suspended', 'Suspended'),
  ('archived', 'Archived (excluded from matching)'),
  ('merged', 'Merged into another identity (excluded from matching)');

CREATE TABLE itap.identity_sources (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.identity_sources (value, description) VALUES
  ('camera', 'Created from a camera detection'),
  ('enrollment', 'Created by face enrollment'),
  ('manual', 'Created manually'),
  ('import', 'Imported'),
  ('merge', 'Created by a merge'),
  ('split', 'Created by a split');

CREATE TABLE itap.identity_photo_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.identity_photo_kinds (value, description) VALUES
  ('capture', 'Camera capture'),
  ('enrollment', 'Enrollment photo'),
  ('manual', 'Uploaded manually');
