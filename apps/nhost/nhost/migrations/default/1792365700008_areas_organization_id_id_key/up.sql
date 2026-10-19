-- Two-column target for references that name an area without its facility (event_rule_version_scopes.area_id:
-- an exactly-one scope row carries no facility). Same-facility references keep using
-- areas_organization_id_facility_id_id_key.
ALTER TABLE itap.areas ADD CONSTRAINT areas_organization_id_id_key UNIQUE (organization_id, id);
