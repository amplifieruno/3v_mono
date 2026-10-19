ALTER TABLE itap.incidents DROP CONSTRAINT incidents_organization_id_dedup_key_key;
ALTER TABLE itap.incidents DROP COLUMN dedup_key;
