CREATE TABLE "itap"."device_health_metrics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "device_id" uuid NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  "cpu_usage" real,
  "memory_usage" real,
  "disk_usage" real,
  "network_latency" real,
  "frame_rate" real,
  "error_count" integer DEFAULT 0,
  PRIMARY KEY ("id"),
  CONSTRAINT "device_health_metrics_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "itap"."devices"("id")
    ON DELETE CASCADE
);

CREATE INDEX "idx_device_health_metrics_device_id" ON "itap"."device_health_metrics" ("device_id");
CREATE INDEX "idx_device_health_metrics_timestamp" ON "itap"."device_health_metrics" ("timestamp" DESC);
