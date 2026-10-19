DROP TRIGGER notification_rules_set_updated_at ON itap.notification_rules;
CREATE TRIGGER notification_rules_set_updated_at BEFORE UPDATE ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
DROP FUNCTION itap.notification_conditions_match(jsonb, itap.events);
DROP TRIGGER notification_rules_validate_conditions ON itap.notification_rules;
DROP FUNCTION itap.validate_notification_rule_conditions();
