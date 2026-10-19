DROP INDEX itap.detections_access_point_window_idx;
DROP INDEX itap.access_decisions_detection_id_key;
ALTER TABLE itap.access_decisions DROP COLUMN detection_id;
ALTER TABLE itap.organization_settings DROP COLUMN face_credential_cooldown_seconds;
ALTER TABLE itap.access_points DROP COLUMN face_credential;
