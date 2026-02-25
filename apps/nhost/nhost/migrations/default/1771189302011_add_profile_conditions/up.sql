ALTER TABLE "itap"."segments"
  ADD COLUMN "profile_conditions" jsonb NOT NULL DEFAULT '{}';
