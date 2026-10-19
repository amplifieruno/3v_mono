-- A watch list's kind decides profiles.is_blacklisted (a segment input): changing it requests a segment evaluation of
-- the organization (slice 6 task 3, review round 1). Other watch list columns are not inputs; entry expiry
-- (expires_at passing) is time-based and picked up by the hourly evaluate_segments.
CREATE CONSTRAINT TRIGGER segment_inputs_changed_update AFTER UPDATE ON itap.watch_lists
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.kind IS DISTINCT FROM NEW.kind)
  EXECUTE FUNCTION itap.segment_inputs_changed();
