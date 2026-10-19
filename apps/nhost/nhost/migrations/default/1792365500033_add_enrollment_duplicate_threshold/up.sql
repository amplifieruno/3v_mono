-- Maximum cosine distance at which enrollment treats a face as an already known identity (duplicate_identity /
-- conflicting_identity), independent of recognition_threshold (live recognition, slice 4).
ALTER TABLE itap.organization_settings
  ADD COLUMN enrollment_duplicate_threshold real NOT NULL DEFAULT 0.5;
