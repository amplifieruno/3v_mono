DROP TABLE itap.webhook_deliveries;
DROP FUNCTION itap.guard_webhook_delivery();
DROP FUNCTION itap.webhook_delivery_transition_allowed(text, text);
DROP TABLE itap.webhook_subscription_event_types;
DROP TABLE itap.webhook_subscriptions;
DROP FUNCTION itap.valid_webhook_url(text);
DROP TABLE itap.webhook_delivery_statuses;
