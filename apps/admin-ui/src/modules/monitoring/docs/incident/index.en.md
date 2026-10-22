# Incidents

An **incident** is a situation an operator has to handle. Event rules with
**Opens an incident** open them (one per person's stay and rule), with the
severity of the event and the rule's escalation policy; **Opened by rule**
names the rule. An operator can also open one by hand with **Create**: a
title, the severity, the place, the assignee and an external reference (a
ticket or police case number).

**Monitoring → Incidents** lists them newest first and refreshes itself every
15 seconds while it is open; the sidebar facility picker narrows it. The saved
views are **Open** (still being handled: open, acknowledged or investigating),
**Unacknowledged** (nobody has taken it on), **Mine** (being handled and
assigned to you) and **Critical** (critical and still being handled).

## The lifecycle

**Status** goes from **Open** through **Acknowledged** and **Investigating** to
**Resolved** and **Closed**. Each step is a button on the incident, offered
only where it applies:

- **Acknowledge** (open): you take the incident on; its escalation stops.
- **Start investigation** (open or acknowledged): an unacknowledged incident is
  acknowledged at the same time.
- **Resolve** (open, acknowledged or investigating): choose the
  **Disposition** (real incident, false alarm, harmless, duplicate) and write
  the **Resolution**.
- **Close** (resolved): final. A closed incident, its notes and its links no
  longer change.
- **Reopen investigation** (resolved): back to investigating; the disposition
  and resolution are cleared (the timeline keeps them).
- **Escalate** (while being handled): notifies the next step of the incident's
  escalation policy now, with your reason.
- **Generate incident report** (any status): queues a report of the incident,
  its timeline and notes, as PDF, Excel, CSV or JSON. The message names the
  report's code; reports are listed on the Reports pages of a later release.

Two operators can look at the same incident. When someone else acknowledged it
while your page still showed **Open**, **Acknowledge** tells you who did and
the page shows the incident as it is now; nothing is recorded twice. When the
incident has moved on further (investigating, resolved), the step is refused
with the reason and nothing changes: reload the incident.

Title, description, severity, place, assignee and external reference can be
edited until the incident is closed. Incidents are never deleted.

## Activity, notes and links

- **Activity** is the incident's timeline: every status change (with the
  disposition and resolution), assignment, escalation, note and generated
  report, with who did it and when. The platform writes it as things happen; it
  cannot be edited.
- **Notes**: what was seen, done or decided. Open a note to attach files
  (photos, clips, documents, up to 25 MB each). Only a note's author can change
  or delete it or its files.
- **Events**: the events that belong to the incident; a rule links the events
  it matched, and you can link others.
- **People**: the identities involved, as the **Subject**, a **Witness** or
  **Related**.

An event rule's **Incidents** tab lists the incidents it opened; an event lists
its incidents, and an identity's **Incidents** tab lists the incidents the
person is involved in.
