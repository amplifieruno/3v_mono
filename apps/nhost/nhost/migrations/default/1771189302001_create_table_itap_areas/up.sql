CREATE TABLE "itap"."areas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "facility_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "area_type" text NOT NULL DEFAULT 'zone',
  "access_level" text NOT NULL DEFAULT 'public',
  "capacity" integer,
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id"),
  CONSTRAINT "areas_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "itap"."facilities"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "areas_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "itap"."areas"("id")
    ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE TRIGGER "set_itap_areas_updated_at"
BEFORE UPDATE ON "itap"."areas"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_areas_updated_at" ON "itap"."areas"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
