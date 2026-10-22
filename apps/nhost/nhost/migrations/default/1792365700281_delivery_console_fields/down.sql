-- Order: the Hasura metadata references the functions (computed fields of notification_deliveries). Before
-- migrating down, remove them from apps/nhost/metadata-src/notifications.ts, run
-- `pnpm --filter nhost metadata:generate` and apply the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.notification_delivery_escalation_policy_id(itap.notification_deliveries);
DROP FUNCTION itap.notification_delivery_title(itap.notification_deliveries);
DROP FUNCTION itap.notification_delivery_origin(itap.notification_deliveries);
DROP FUNCTION itap.notification_delivery_to_me(itap.notification_deliveries, json);
