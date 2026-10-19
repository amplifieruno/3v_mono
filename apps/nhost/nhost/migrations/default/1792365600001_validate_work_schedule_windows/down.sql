ALTER TABLE itap.work_schedules DROP CONSTRAINT work_schedules_windows_valid;
ALTER TABLE itap.work_schedules ADD CONSTRAINT work_schedules_windows_is_array CHECK (jsonb_typeof(windows) = 'array');
