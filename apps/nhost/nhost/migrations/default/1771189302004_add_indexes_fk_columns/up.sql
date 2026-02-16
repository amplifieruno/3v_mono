CREATE INDEX idx_areas_facility_id ON "itap"."areas"("facility_id");
CREATE INDEX idx_areas_parent_id ON "itap"."areas"("parent_id");
CREATE INDEX idx_segment_memberships_segment_id ON "itap"."segment_memberships"("segment_id");
CREATE INDEX idx_segment_memberships_identity_id ON "itap"."segment_memberships"("identity_id");
