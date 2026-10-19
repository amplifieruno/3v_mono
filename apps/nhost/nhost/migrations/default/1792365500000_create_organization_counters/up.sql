-- Per-organization, per-entity gapless-ish counters behind human-readable codes (IDENTITY-00001).
-- itap.assign_number('<entity>') is a BEFORE INSERT trigger that fills NEW.number from this table.
CREATE TABLE itap.organization_counters (
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  entity text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, entity)
);

-- Usage: CREATE TRIGGER number BEFORE INSERT ON itap.<t> FOR EACH ROW EXECUTE FUNCTION itap.assign_number('<entity>');
-- The upsert takes a row lock on the counter, so concurrent inserts of one organization serialize on it and get
-- distinct consecutive numbers; a rolled-back insert releases its number. An explicit NEW.number is kept as is.
CREATE FUNCTION itap.assign_number() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  entity_key text := TG_ARGV[0];
BEGIN
  IF entity_key IS NULL OR entity_key = '' THEN
    RAISE EXCEPTION 'assign_number: trigger % on %.% needs an entity key argument', TG_NAME, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'assign_number: organization_id is required on %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF NEW.number IS NULL THEN
    INSERT INTO itap.organization_counters AS c (organization_id, entity, last_value)
    VALUES (NEW.organization_id, entity_key, 1)
    ON CONFLICT (organization_id, entity) DO UPDATE SET last_value = c.last_value + 1
    RETURNING c.last_value INTO NEW.number;
  END IF;
  RETURN NEW;
END;
$$;
