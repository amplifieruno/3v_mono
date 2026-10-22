# Deliveries

A **delivery** is one notification to one recipient on one channel. The
platform writes them; the log is read only.

## Where a delivery comes from

**Origin** says what sent it:

- **Notification rule**: a rule matched an event and told its recipient
  group.
- **Escalation**: an escalation step paged someone because an incident
  stayed unacknowledged. **Pass** counts the passes through a repeating
  policy, from 0.
- **Subscription**: a member's own subscription matched an event. You only
  see deliveries of your own subscriptions; other members' stay private.
- **Report**: a scheduled report is ready.

The recipient is a member of the organization or an external address
(email or phone number) of a recipient group.

## Status

A delivery is **Pending** until it is sent, then **Sent** (handed to the
email, SMS or push provider) and **Delivered**. An in-app notification is
delivered as soon as it lands in the inbox.

- **Not before** holds a delivery until the recipient's quiet hours end, a
  digest closes or the next retry is due.
- A failed attempt makes it **Failed** or **Retrying**; sending is tried up to
  five times. Then it is given up as a **Dead letter**, as is a delivery to a
  member who is no longer active. **Error** says why.
- With a digest rule, matches are **In a digest**: they are not sent on their
  own but combined into one digest delivery, whose **Digest items** tab lists
  them.

## Views

- **Failed**: deliveries waiting for another attempt.
- **Dead letters**: deliveries given up.
- **Mine**: deliveries sent to you.

Incidents and events have a **Notifications** tab with the deliveries about
them, and a notification rule and a subscription have a **Deliveries** tab.

## Delivery report

The **Delivery report** page counts the deliveries of the last 24 hours,
7 or 30 days: headline figures, then a row per channel with the counts by
status, acknowledgements, and for in-app notifications the share
acknowledged and the average time to acknowledge. Webhook deliveries are
counted on the webhook row; digest items count once, in their digest.
