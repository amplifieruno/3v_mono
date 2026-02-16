-- Add recognition control columns to devices
ALTER TABLE "itap"."devices"
  ADD COLUMN "recognition_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "recognition_fps" integer NOT NULL DEFAULT 2;

-- Add constraint for FPS range
ALTER TABLE "itap"."devices"
  ADD CONSTRAINT "devices_recognition_fps_range"
    CHECK (recognition_fps >= 1 AND recognition_fps <= 5);

-- Index for quickly finding active recognition devices on startup
CREATE INDEX "idx_devices_recognition_enabled"
  ON "itap"."devices" ("recognition_enabled")
  WHERE recognition_enabled = true;
