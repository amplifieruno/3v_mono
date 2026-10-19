ALTER TABLE itap.organization_settings
  DROP CONSTRAINT organization_settings_abnormal_movement_thresholds,
  DROP COLUMN abnormal_movement_min_total,
  DROP COLUMN abnormal_movement_max_count;
