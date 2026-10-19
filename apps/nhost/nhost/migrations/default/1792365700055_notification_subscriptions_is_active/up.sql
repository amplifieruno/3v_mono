-- Unsubscribing keeps history: an inactive subscription receives nothing (Stage C skips it, migration
-- *_fan_out_webhooks) but its deliveries stay; hard delete still cascades them.
ALTER TABLE itap.notification_subscriptions ADD COLUMN is_active boolean NOT NULL DEFAULT true;
