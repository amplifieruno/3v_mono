-- Final review fix 4: webhooks have their own subscriptions (webhook_subscriptions); escalation steps and notification
-- rules never deliver over the webhook channel (as notification_subscriptions since 1792365700047). No existing row
-- uses it (checked on the dev database; the seed does not).
ALTER TABLE itap.escalation_policy_steps
  ADD CONSTRAINT escalation_policy_steps_channel_not_webhook CHECK (channel <> 'webhook');
ALTER TABLE itap.notification_rule_channels
  ADD CONSTRAINT notification_rule_channels_channel_not_webhook CHECK (channel <> 'webhook');
