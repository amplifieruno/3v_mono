# Legal holds

A **legal hold** keeps data from being purged or erased while a claim, an
investigation or an authority request needs it. **Compliance → Legal holds**
lists them, newest first.

A hold is **in force** from its **Starts** moment until its **Ends** moment
(or until further notice when there is no end). While it is in force:

- the nightly retention run skips every row about what it covers and counts
  them as **kept by a legal hold**; they are purged by a later run once the
  hold ends;
- an **erasure request** for a covered person completes **partially**: what
  the hold covers stays, the request records which holds kept what;
- a target of the hold cannot be removed from it.

Holds are judged at the moment of each run, not at the run's scheduled time.

## What a hold covers

On the hold's page, one tab per kind of target, each with **+ Create**:

- **People**: a profile, every identity linked to it and every identity merged
  into it, and every row about them (detections, sessions, events, decisions,
  attempts, files);
- **Identities**: one tracked face, such as an unknown person seen at an
  incident, and the whole person behind it: its profile, the profile's other
  identities and the identities merged with it;
- **Incidents**: an incident with its notes, activities, linked events and
  reports;
- **Facilities**: every row recorded at the facility.

A target is added once per hold; removing one is refused while the hold is in
force (Delete is disabled with the reason).

Profiles, identities and incidents covered by a hold in force say so at the
top of their page, with a link to each hold. The notice shows holds that name
this record or a record directly linked to it: a profile's identities; an
identity's profile and that profile's other identities; an incident's facility
and the people it names. A hold can also reach a record further away, through
completed merges or the wider person graph; the retention plan and runs count
those rows as kept.

## Dates move one way

- Before a hold starts, both dates can be changed freely.
- Once it has **started**, its start is shown but no longer offered as an
  input: what it protected from then on stays protected.
- The end of a started hold can be **set** (from until further notice to a
  date) or **moved earlier**, never later and never cleared. An end in the past
  ends the hold now. To keep data longer, create another hold.
- **End now** (More menu) ends a started hold at once.
- Once **ended**, a hold's dates are frozen and it cannot be reactivated.

Holds are never deleted: an ended hold stays as history. Every change is
recorded in the audit log.
