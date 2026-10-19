DROP FUNCTION itap.escalate_incidents(uuid, timestamptz);
DROP FUNCTION itap.write_escalation_delivery(itap.incidents, itap.escalation_policy_steps, integer, uuid, text, jsonb, uuid, timestamptz, text);
DROP FUNCTION itap.next_escalation_step(uuid, uuid, integer);
DROP FUNCTION itap.quiet_hours_release(uuid, uuid, text, timestamptz, text);
