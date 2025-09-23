CREATE TABLE "itap"."profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "first_name" text, "last_name" text, "email" text, PRIMARY KEY ("id") );
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
CREATE TRIGGER "set_itap_profiles_updated_at"
BEFORE UPDATE ON "itap"."profiles"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();
COMMENT ON TRIGGER "set_itap_profiles_updated_at" ON "itap"."profiles"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE EXTENSION IF NOT EXISTS pgcrypto;
