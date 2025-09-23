CREATE TABLE "itap"."identities" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "images" text[] NOT NULL, "status" text NOT NULL DEFAULT 'unverified', "attributes" jsonb NOT NULL, PRIMARY KEY ("id") );
CREATE OR REPLACE FUNCTION "itap"."set_current_timestamp_updated_at"()
RETURNS TRIGGER AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "set_itap_identities_updated_at"
BEFORE UPDATE ON "itap"."identities"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_itap_identities_updated_at" ON "itap"."identities"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
