DROP TRIGGER audit ON itap.profiles;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

DROP TRIGGER identities_count_profiles ON itap.identities;
DROP FUNCTION itap.identities_count_profiles();
DROP TRIGGER identities_link ON itap.identities;
DROP FUNCTION itap.identities_link();
