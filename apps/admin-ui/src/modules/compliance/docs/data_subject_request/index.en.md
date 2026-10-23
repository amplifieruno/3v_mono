# Data subject requests

A **data subject request** is a person exercising their rights over their
data (GDPR Art. 15 to 20). **Compliance → Data subject requests** lists them,
newest first; **Open** shows those still being worked on, **Overdue** the open
ones the platform reported past their due date (within about 10 minutes of the
deadline, with a `dsr_overdue` event), **Partial (legal hold)** the erasures a
hold kept part of.

## Filing a request

Verify the person's identity first. Then use the button of the right:

- **Access request**: a copy of everything the platform holds about the
  person, as a zip;
- **Portability request**: the same bundle, to take elsewhere;
- **Rectification request**: something about them is wrong; say what in
  **Requested changes**;
- **Restriction request**: their data must not be processed for now;
- **Erasure request**: their data must go (see below).

Each asks for the **Person**, when the request was **Received** (empty for
now; never in the future) and when it is **Due**. Left empty, the deadline is
30 days after receipt; it can be extended for a complex request, to at most 90
days after receipt. The form says so before anything is sent, and the database
refuses the same.

Filing starts the background job within seconds. The request's page follows
it on the **Steps** tab, reading it again every few seconds while the job works
on it.

## What the job does

- **Access, portability**: it gathers the person's profile, identities,
  detections, sessions, events, decisions, visits, consents and documents
  (latest rows per kind; other people's ids are stripped) with their files into
  a zip. The zip appears as **Bundle** on the completed request. It is a
  sensitive file: **Open** asks for a short-lived link, and every opening is
  written to the audit log. Hand it over securely.
- **Restriction**: processing of the person is restricted at once and the
  request completes. The restriction stays until a member lifts it on the
  profile (**Lift restriction**, with a reason).
- **Rectification**: the job hands the request to you (the step "Waiting for
  the rectification"). Correct the profile as asked, then **Complete** the
  request saying what was corrected; this is audited.
- **Erasure**: see below.

When an attempt fails, the job tries again with a growing delay and the page
shows the **Last error**. After 5 failed attempts it stops: fix the cause, then
**Retry** (in the **More** menu) for a fresh budget of 5 attempts.

**Reject** closes an open request without fulfilling it (for example when the
identity could not be verified), with the reason the person is told. A request
whose person no longer exists is rejected by the job itself
(`subject_not_found`).

Requests are records of compliance: only their **Notes** can be edited, and
they are never deleted.

## Erasure

Erasure cannot be undone, so **Erasure request** shows, once the person is
chosen, what will happen:

- detections, locations, sessions, events, access decisions, face
  authentication attempts and evidence, deliveries, searches and export jobs
  about the person are deleted; bulk job rows are archived;
- photos and face templates are deleted, and identities no kept row refers to;
- mentions in saved searches, reports, incidents, visits, consents, documents
  and the audit log are redacted;
- the profile becomes a tombstone named **Erased subject** (inactive,
  restricted); files are deleted within about 10 minutes.

It also lists each **legal hold** in force that covers the person or their
identities. Under such a hold the erasure keeps what the hold covers and
completes as **Partial**: the request's page then says what was kept and links
the holds that kept it. To erase it later, end the hold and file a new request.

To file it, type the person's **code** (such as P-00042, shown in the review)
in the confirmation box: without the matching code nothing is sent. The flow
then shows the review once more and asks a last confirmation. Processing is
restricted at once, before anything is erased.
