DELETE FROM itap.webhook_subscription_event_types WHERE event_type = 'report_generated';
DELETE FROM itap.notification_rule_event_types WHERE event_type = 'report_generated';
DELETE FROM itap.notification_subscriptions WHERE event_type = 'report_generated';
DELETE FROM itap.events WHERE event_type = 'report_generated';
DELETE FROM itap.event_types WHERE value = 'report_generated';
DROP TABLE itap.report_metric_types;
DROP TABLE itap.report_statuses;
DROP TABLE itap.report_formats;
DROP TABLE itap.report_types;
