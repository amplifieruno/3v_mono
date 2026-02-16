CREATE TABLE "itap"."facilities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "description" text,
  "address" text,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id")
);

CREATE TRIGGER "set_itap_facilities_updated_at"
BEFORE UPDATE ON "itap"."facilities"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_facilities_updated_at" ON "itap"."facilities"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
