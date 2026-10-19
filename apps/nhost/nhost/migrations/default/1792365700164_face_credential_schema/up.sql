-- Physical access in Stage B (plan-08 task 3), schema part.
-- * access_points.face_credential: the door's bound camera (access_point_devices role camera, detections.access_point_id)
--   acts as a credential reader: Stage B records an access decision for faces detected there.
-- * organization_settings.face_credential_cooldown_seconds: at most one face decision per person and access point
--   within this many seconds (either side of the detection time, so out-of-order evaluation cannot add one).
-- * access_decisions.detection_id: the detection a face decision was made for (log-to-log reference, plain uuid
--   without FK); the partial unique index makes the decision idempotent per detection (event redelivery).
-- * detections (organization_id, access_point_id, detected_at): the tailgating window lookup.
ALTER TABLE itap.access_points ADD COLUMN face_credential boolean NOT NULL DEFAULT false;

ALTER TABLE itap.organization_settings
  ADD COLUMN face_credential_cooldown_seconds integer NOT NULL DEFAULT 10
    CONSTRAINT organization_settings_face_credential_cooldown_check
      CHECK (face_credential_cooldown_seconds BETWEEN 1 AND 3600);

ALTER TABLE itap.access_decisions ADD COLUMN detection_id uuid;
CREATE UNIQUE INDEX access_decisions_detection_id_key ON itap.access_decisions (detection_id)
  WHERE detection_id IS NOT NULL;

CREATE INDEX detections_access_point_window_idx ON itap.detections (organization_id, access_point_id, detected_at)
  WHERE access_point_id IS NOT NULL;
