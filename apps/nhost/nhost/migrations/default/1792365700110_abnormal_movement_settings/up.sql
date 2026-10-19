-- Stage B abnormal_movement thresholds (plan-07 task 1): a transition from -> to is abnormal when it was seen at most
-- abnormal_movement_max_count times in area_transitions_daily during the 30 days before the detection's local day,
-- while the from area had at least abnormal_movement_min_total outgoing and the to area at least that many incoming
-- transitions in the same window (no noise while the history is cold).
ALTER TABLE itap.organization_settings
  ADD COLUMN abnormal_movement_max_count integer NOT NULL DEFAULT 1,
  ADD COLUMN abnormal_movement_min_total integer NOT NULL DEFAULT 20,
  ADD CONSTRAINT organization_settings_abnormal_movement_thresholds
    CHECK (abnormal_movement_max_count >= 0 AND abnormal_movement_min_total >= 1);
