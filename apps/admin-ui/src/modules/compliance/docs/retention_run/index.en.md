# Retention runs

A **retention run** is one nightly purge (03:30 UTC) of every active retention
policy. **Compliance → Retention runs** lists them, newest first; the view
**Failed or interrupted** shows the ones to look at. Runs are written by the
platform only: the console never starts or changes one (the **Retention plan**
counts without purging).

- **Scheduled**: the moment the run purges up to; each class's cutoff is this
  moment minus its policy's days.
- **Status**: **Running**, **Completed**, **Failed** (a class stopped with an
  error, shown on its row; the other classes still ran) or **Interrupted**
  (the worker stopped; the next run continues the work).

## Classes

A run's page lists one row per class and scope it purged, in purge order:

- **Cutoff**, **Action** and the **Policy** applied (empty for the consent
  window of the organization settings);
- **Purged**: the rows deleted, anonymized or archived;
- **Kept by a legal hold**: rows past the cutoff that an active hold covers;
- **Files queued**: files queued for deletion with the rows. The count
  includes the uploaded originals of purged face crops (a crop's original goes
  with it), so it can be larger than the number of rows;
- **Batches**, **Completed** and **Error**.

An erasure request counts its files the same way.

## The file deletion queue

Files are never deleted inside the database transaction that purges their
rows: they are queued, and the job `drain_file_deletions` deletes them from
storage every 10 minutes (a failed deletion is retried with a growing delay).
A file that something refers to again is dropped from the queue, and a queued
file cannot be attached again. Besides retention and erasure, the queue
receives:

- **uploaded face photos** (kind `face_source`): the originals sent to
  **Enroll face**, **Add photos** or **Create from photos** are queued about
  an hour after upload, whatever the answer. This sweep ignores legal holds:
  a raw upload is not a record (the platform keeps its own crop of each
  accepted face, and the crop is what a hold keeps);
- **frames of "Authenticate a face"** (reason `auth_tester_frame`): the
  frames a console test uploads are queued once the test has used them,
  whatever the outcome.
