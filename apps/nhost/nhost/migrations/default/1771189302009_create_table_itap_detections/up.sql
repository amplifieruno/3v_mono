CREATE TABLE "itap"."detections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "device_id" uuid NOT NULL,
  "identity_id" uuid,
  "confidence" real NOT NULL,
  "similarity" real,
  "is_new_identity" boolean NOT NULL DEFAULT false,
  "bbox" jsonb,
  "thumbnail" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "detections_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "itap"."devices"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "detections_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "itap"."identities"("id")
    ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX "idx_detections_device_id" ON "itap"."detections" ("device_id");
CREATE INDEX "idx_detections_identity_id" ON "itap"."detections" ("identity_id");
CREATE INDEX "idx_detections_created_at" ON "itap"."detections" ("created_at" DESC);
CREATE INDEX "idx_detections_device_created" ON "itap"."detections" ("device_id", "created_at" DESC);
