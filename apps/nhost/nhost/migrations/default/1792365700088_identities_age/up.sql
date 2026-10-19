-- identities.age: attributes.age as an integer column (whole number 0..999 given as a JSON number or digit string,
-- else NULL), so segment conditions can compare ages with a Hasura where (range operators on a jsonb path are not
-- expressible). Derived from attributes, hence not audited separately.
ALTER TABLE itap.identities ADD COLUMN age integer GENERATED ALWAYS AS (
  CASE WHEN jsonb_typeof(attributes -> 'age') IN ('number', 'string') AND (attributes ->> 'age') ~ '^[0-9]{1,3}$'
       THEN (attributes ->> 'age')::integer END
) STORED;
CREATE INDEX identities_organization_id_age_idx ON itap.identities (organization_id, age);
DROP TRIGGER audit ON itap.identities;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:last_seen_at', 'ignore:detection_count', 'ignore:first_seen_at', 'ignore:confidence', 'ignore:age'
  );
