CREATE TABLE "itap"."segment_profile_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "segment_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("segment_id") REFERENCES "itap"."segments" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("profile_id") REFERENCES "itap"."profiles" ("id") ON DELETE CASCADE,
  UNIQUE ("segment_id", "profile_id")
);
