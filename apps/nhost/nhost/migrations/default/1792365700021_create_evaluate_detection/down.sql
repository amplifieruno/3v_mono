DROP FUNCTION itap.evaluate_detection(uuid);
DROP FUNCTION itap.evaluate_tailgating(itap.detections, itap.events);
DROP FUNCTION itap.evaluate_abnormal_movement(itap.identity_locations, itap.events);
