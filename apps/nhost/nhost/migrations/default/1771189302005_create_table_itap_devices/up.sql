CREATE TABLE "itap"."devices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "device_type" text NOT NULL DEFAULT 'static_video_camera',
  "area_id" uuid,
  "stream_url" text,
  "credentials" jsonb DEFAULT '{}',
  "resolution" text DEFAULT '1920x1080',
  "fps" integer DEFAULT 30,
  "status" text NOT NULL DEFAULT 'inactive',
  "health_status" text NOT NULL DEFAULT 'unknown',
  "last_seen" timestamptz,
  "configuration" jsonb DEFAULT '{}',
  PRIMARY KEY ("id"),
  CONSTRAINT "devices_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "itap"."areas"("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX "idx_devices_area_id" ON "itap"."devices" ("area_id");
CREATE INDEX "idx_devices_status" ON "itap"."devices" ("status");
CREATE INDEX "idx_devices_device_type" ON "itap"."devices" ("device_type");

CREATE TRIGGER "set_itap_devices_updated_at"
BEFORE UPDATE ON "itap"."devices"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_devices_updated_at" ON "itap"."devices"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
