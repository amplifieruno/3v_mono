# Exports

An **export definition** saves an export of the organization's data to a file:

- **Data**: profiles, identities, events, incidents, visits, access decisions,
  detections (last 31 days only), face authentication attempts or the audit log;
- **Filters**: which rows, as a JSON object in Hasura's `where` syntax, such as
  `{"status": {"_eq": "active"}}` (`{}` exports every row);
- **Format**: CSV, JSON or Excel;
- **Mode**: **Full** exports every matching row each time; **Incremental** only the
  rows created since the last completed job (**Exported up to**). Changing the
  data, filters or mode starts an incremental export from the beginning again;
- **Rows per file**: at most 50,000; a longer export is cut and marked
  **truncated** (an incremental one continues in the next job);
- **Schedule**: a cron in the chosen time zone (checked every 15 minutes), or none
  to run by hand only.

## Owner only

The member who creates a definition is its **owner**. Every administrator sees
every definition and its jobs, but only the owner can edit, delete or run it: a
job reads the data **as the owner**, with the owner's permissions. If the owner is
no longer an active member, the schedule stops (**Last schedule error**:
`owner_not_member`).

## Run now and jobs

**Run now** starts a job and opens it; the job page follows it until the file is
ready. One job of a definition runs at a time. **Compliance → Export jobs** lists
every job with its status, rows and requester; jobs are written by the platform
only.

## The file

An export file belongs to the member who ran the export. Only that member sees
**Open file** on the job; another administrator sees the job without a link, and
the platform refuses to open the file for anyone else. Each opening is recorded in
the audit log. Files are kept as long as the **Export jobs** retention policy
says, and a data subject erasure removes the files that name the person.
