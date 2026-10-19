-- Window entries were interpreted leniently by in_windows (slice 2); now their shape is enforced at write time.
-- Every existing (seeded) schedule uses well-formed windows, so the constraint validates immediately.
ALTER TABLE itap.work_schedules DROP CONSTRAINT work_schedules_windows_is_array;
ALTER TABLE itap.work_schedules ADD CONSTRAINT work_schedules_windows_valid CHECK (itap.valid_windows(windows));
