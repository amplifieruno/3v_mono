# Escalation policies

An **escalation policy** says who is paged, step by step, while an incident
stays unacknowledged. Event rule versions and notification rules give a
policy to the incidents they open; it can also be chosen on the incident.

## Steps

Each step pages either a **recipient group** or the **person on call** in an
on-call schedule. The **Steps** tab shows the whole sequence in order, both
kinds together, each row naming the group or the schedule it pages; it is
read only. Steps are added, changed and removed on the **Group steps** and
**On-call steps** tabs, one per kind, each with its own **+ Create**:

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
limits the repeats and is required while **Repeat** is on: the number of
passes through the steps in all, the first included (3 means the first pass
and two repeats). A policy cannot repeat without a bound. Switching **Repeat**
off clears it; switching it on again starts empty, so enter the number anew.
