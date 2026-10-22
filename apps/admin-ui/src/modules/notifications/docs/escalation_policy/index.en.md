# Escalation policies

An **escalation policy** says who is paged, step by step, while an incident
stays unacknowledged. Event rule versions and notification rules give a
policy to the incidents they open; it can also be chosen on the incident.

## Steps

Each step pages either a **recipient group** or the **person on call** in an
on-call schedule, so the **Steps** tab has two lists, one per kind, each with
its own **+ Create**:

- **Step**: the step's number. Steps run from the lowest number up, both
  kinds together. There is no dragging: to move a step, change its number.
  Each number is used once per policy; leaving gaps (10, 20, 30) makes room
  to insert a step later.
- **After (minutes)**: how long the incident must stay unacknowledged before
  the step pages, counted from the incident for the first step and from the
  previous page for the others. 0 pages at once.
- **Channel**: in-app, email, SMS or push. Never a webhook.

The escalation job checks every minute; acknowledging the incident (or an
escalation page in the inbox) stops the policy.

## Repeat

Without **Repeat** the policy stops after its last step. With it, the steps
start again from the first while nobody acknowledges. **Passes at most**
limits the repeats: the number of passes through the steps in all, the first
included (3 means the first pass and two repeats). Leave it empty to repeat
until someone acknowledges. Switching **Repeat** off clears it.
