# Recipient groups

A **recipient group** is a set of people told together. Notification rules
notify a group; escalation policies page one at a step.

## People and external addresses

A member is either a **person** of the organization or an **external
address**, never both and never neither, so the group page keeps them on two
tabs, each with its own **+ Create**:

- **People**: a member of the organization (active when added) and the
  **Channel** they are listed with: in-app, email, SMS or push. To reach a
  person on several channels, list them once per channel. A person who is
  deactivated later stays listed but receives nothing; one on vacation is
  reached through their delegate.
- **External addresses**: someone without a console account, reached by
  **Email** (an address such as `alerts@example.com`) or **SMS** (a phone
  number in international format, such as `+441632960123`). The address must
  fit its channel.

Webhooks are never a member's channel: they have subscriptions of their own.

## Who is told

A notification rule tells each member on every rule channel the member is
listed with. An escalation step pages every person of the group on the
step's channel, and the external addresses listed with that channel.

The **Rules notifying it** and **Escalation steps paging it** tabs show
where the group is used. A group an escalation step pages cannot be deleted
until that step pages someone else.
