-- Order: the Hasura metadata references the functions (computed fields on_call_schedules.on_call_user_id /
-- shift_ends_at). Before migrating down, remove them from apps/nhost/metadata-src/notifications.ts, run
-- `pnpm --filter nhost metadata:generate` and apply the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.on_call_schedule_shift_ends_at(itap.on_call_schedules);
DROP FUNCTION itap.on_call_schedule_on_call_user_id(itap.on_call_schedules);
