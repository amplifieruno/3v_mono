DROP TRIGGER audit ON itap.incidents;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
