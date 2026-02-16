CREATE TABLE "itap"."segments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#6366f1',
  "icon" text,
  "segment_type" text NOT NULL DEFAULT 'manual',
  "conditions" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id")
);

CREATE TRIGGER "set_itap_segments_updated_at"
BEFORE UPDATE ON "itap"."segments"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_segments_updated_at" ON "itap"."segments"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
