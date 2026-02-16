DROP INDEX IF EXISTS "itap"."idx_devices_recognition_enabled";
ALTER TABLE "itap"."devices" DROP CONSTRAINT IF EXISTS "devices_recognition_fps_range";
ALTER TABLE "itap"."devices" DROP COLUMN IF EXISTS "recognition_fps";
ALTER TABLE "itap"."devices" DROP COLUMN IF EXISTS "recognition_enabled";
