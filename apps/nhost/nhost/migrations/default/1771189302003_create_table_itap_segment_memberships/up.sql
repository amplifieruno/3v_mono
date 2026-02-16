CREATE TABLE "itap"."segment_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "segment_id" uuid NOT NULL,
  "identity_id" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  UNIQUE ("segment_id", "identity_id"),
  CONSTRAINT "segment_memberships_segment_id_fkey"
    FOREIGN KEY ("segment_id") REFERENCES "itap"."segments"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "segment_memberships_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "itap"."identities"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE
);
