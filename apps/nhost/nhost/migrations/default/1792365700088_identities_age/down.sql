DROP TRIGGER audit ON itap.identities;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:last_seen_at', 'ignore:detection_count', 'ignore:first_seen_at', 'ignore:confidence');
ALTER TABLE itap.identities DROP COLUMN age;
