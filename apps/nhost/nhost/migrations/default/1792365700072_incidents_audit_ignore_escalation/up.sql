-- Final review fix 3: the escalation counters (escalation_step, last_escalated_at; written by the escalate cron and
-- escalate_one, read-only in metadata) are not audited, so a cron escalation writes no audit row; the escalation is
-- recorded as an incident activity ('escalated'). incidents has no other system-written counters.
DROP TRIGGER audit ON itap.incidents;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.incidents
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:escalation_step', 'ignore:last_escalated_at');
