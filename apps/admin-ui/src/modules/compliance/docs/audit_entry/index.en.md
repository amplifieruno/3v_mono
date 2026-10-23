# Audit log

**Compliance → Audit log** lists every change the platform recorded for this
organization, newest first: when, the **action**, the kind of record (**entity**),
the **record**, who did it (**By**) and, when one was recorded, the **reason**.
The log is written by the database and the platform's own functions. Nobody can
add, change or delete an entry from the console, and the database refuses it too.
Old entries leave only through retention (the `audit_log` class keeps at least
365 days).

## What is recorded

- **Created**, **Changed**, **Removed**: a row of an audited table was added,
  changed or deleted. A change records each changed column with its value
  before and after. A created or removed row records the whole row.
- **Exported**, **Viewed sensitive data**: an export file was written, or a
  sensitive file (a document, a face photo, an export, a DSR bundle) was opened.
- **Merged**, **Rolled back**, **Approved**, **Rejected**, **Published**,
  **Restricted**, **Restriction lifted**, **Erased**, **Rectified**,
  **Switched organization**: acts of the platform's functions. Each records the
  details the function wrote, such as the request code of an erasure.
- A row purged by retention, or erased by a data subject request, is recorded
  without its values. Only the fact that it was purged is kept.
- **By** is empty for the platform's own jobs (retention, integration syncs,
  the seed) and for entries the audit retention anonymized. A deactivated
  member still shows by name; an account whose membership was removed shows its
  id. The **reason** names the request (`dsr:DSR-…`) or the integration
  (`integration:INT-…`) behind a job's change.
- An entry whose values were **erased** later reads "Values erased": an
  erasure request blanks the earlier entries about the person, and the audit
  log's retention policy can anonymize old entries. When it happened and the
  kind of change are kept.

Personal records of other members (their dashboards, saved searches,
subscriptions, workspaces and searches) are not shown. Each member sees only
the entries for their own.

## Finding entries

Filter by **Entity**, **Action**, **By** and **When** (a time range), or by
**Record** (the record's id) to see the whole history of one record. Pick the
**Entity** first when you filter by record: the log is looked up by kind of
record, then id, so the two together answer fastest. The saved
views **Removed rows**, **Sensitive data viewed** and **Exports** are one
click away. The list loads 50 entries at a time and counts them only when you
ask.

## Reading an entry

The entry's page shows **What changed**:

- for a change, one line per changed field with **Before** and **After**; a
  changed JSON setting is opened into the keys that changed
  (`config › schedule cron`);
- for a created or removed row, each of its fields;
- for other actions, what the platform recorded.

Secrets (passwords, API keys, webhook and integration secrets, key hashes) are
stored redacted. They read **Redacted** and their value is never shown, before
or after a change.

**Record** links to the record's page when it has one in the console and was
not removed. Rows of a link table (an incident's notes, a rule's channels, a
hold's targets), rows without a page of their own (photos, files, the
organization's settings) and removed rows show the record's name or the start
of its id as plain text.
