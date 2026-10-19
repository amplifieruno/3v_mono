DROP FUNCTION itap.fan_out_events(uuid, uuid[]);
DROP FUNCTION itap.fan_out_event(uuid);
DROP FUNCTION itap.severity_priority(text);
DROP FUNCTION itap.matching_notification_rules(itap.events);
DROP FUNCTION itap.write_event_delivery(itap.events, uuid, text, uuid, uuid, text, text, text, uuid, text, jsonb, text);
DROP FUNCTION itap.notification_content(uuid, uuid, text, text, jsonb);
DROP FUNCTION itap.notification_vars(itap.events, uuid, text);
DROP FUNCTION itap.notification_recipient(uuid, uuid, timestamptz, boolean);
