DROP TRIGGER event_rules_set_updated_at ON itap.event_rules;
CREATE TRIGGER event_rules_set_updated_at BEFORE UPDATE ON itap.event_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
DROP FUNCTION itap.set_updated_at_except();
