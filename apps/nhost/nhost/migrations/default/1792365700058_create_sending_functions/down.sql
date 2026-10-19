DROP FUNCTION itap.due_webhook_deliveries(timestamptz, integer);
DROP FUNCTION itap.finish_webhook_delivery(uuid, integer, boolean, boolean, integer, text, text);
DROP FUNCTION itap.claim_webhook_delivery(uuid);
DROP INDEX itap.notification_deliveries_retrying_deliver_after_idx;
DROP FUNCTION itap.due_notification_deliveries(timestamptz, integer);
DROP FUNCTION itap.finish_notification_delivery(uuid, integer, boolean, boolean, text);
DROP FUNCTION itap.claim_notification_delivery(uuid);
DROP FUNCTION itap.delivery_max_attempts();
DROP FUNCTION itap.delivery_backoff(integer);
