# Retention policies

A **retention policy** says how long one class of data is kept before the
nightly retention run deletes, anonymizes or archives it. **Compliance →
Retention policies** lists them; the views **Active**, **Inactive** and
**Facility-specific** narrow the list.

No policy means **keep**: a class without an active policy is never purged.
The one exception is face templates after withdrawn consent, which follow the
consent window of the organization settings (30 days by default) until a
policy for that class exists.

## Data classes

Each policy covers one **data class**: detections, locations, tracking
sessions, events, notification deliveries, webhook deliveries, incidents
(resolved or closed only), photos of archived faces, face templates after
withdrawn consent, unknown identities, face authentication attempts and
evidence, search history, bulk jobs, reports, access decisions, the terminal
sync log, statistics, the audit log, export jobs and integration sync runs.

The class rules come from the database, which refuses anything else; the form
says so before saving:

- **Facility**: only classes whose rows belong to one facility take a
  facility-specific policy: detections, locations, sessions, events,
  incidents, access decisions, the terminal sync log and statistics. For them
  the facility field appears; empty means the whole organization. A
  facility-specific policy beats the organization-wide one in its facility,
  and the organization-wide run leaves that facility to it.
- **Action**: **Delete** is accepted by every class. **Anonymize** (the rows
  stay for counts and trends, without the people they named and without their
  payload) only by detections, sessions, events, incidents, access decisions,
  face authentication attempts, unknown identities and the audit log.
  **Archive** (the rows stay without their files and derived rows) only by
  reports and bulk jobs.
- **Keep for (days)**: 1 to 36 500. The **audit log** and **face
  authentication attempts** are kept at least **365 days**.
- **One active policy** per class and facility (or per class for the whole
  organization). The form refuses a second one; create it inactive, or
  deactivate the other first.

The class and the facility are chosen once; **Keep for**, **Action** and the
**Description** can be edited later.

## Activate and deactivate

**Deactivate** (More menu) stops a policy from purging. A facility-specific
policy then hands its facility back to the organization-wide one; an
organization-wide policy leaves the class kept. **Activate** makes it purge
again from the next run, and is refused with the reason while another active
policy covers the same scope. **Delete** (More menu) removes a policy; its runs keep what they did. It is
refused while a record of processing names the policy as its retention:
deactivate it instead.

## What happens at night

The run `retention_cleanup` starts every day at 03:30 UTC. It purges each
active policy's class up to its **cutoff** (the run's time minus the
policy's days), in a fixed order (logs before what they refer to, biometrics
and identities late, the audit log last), in batches, and records what it did
as a **retention run** (Compliance → Retention runs). Rows that an active
**legal hold** covers are skipped and counted; they are purged by a later run
once the hold ends. The page **Retention plan** shows what a run would purge
now, without purging anything.

A policy's **Runs** tab lists what each run did under it.
