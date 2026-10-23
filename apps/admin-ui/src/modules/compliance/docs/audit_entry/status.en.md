# System status

**Compliance → System status** shows the platform's health as an organization
administrator sees it. The page checks when it opens; **Check again** checks
once more. The time of the check is shown next to the overall status.

- **Services**: the GraphQL engine (Hasura), the database, face recognition
  (InsightFace, with its model), file storage and the stream server. Each is
  **OK**, **Degraded** (it answered slowly, over one second) or **Down** (no
  answer, an error, or no answer within 3 seconds), with its response time.
  A service that is down shows its error. The rest of the page still shows.
- **Database**: connections in use, the database size and the largest tables.
- **Background jobs**: each scheduled job (cron) with its status, how late it
  runs, when it last ran and its errors in the last 24 hours. A job is
  **Degraded** when it is more than 5 minutes late or failed in the last day,
  and **Down** when it is more than an hour late.
- **Queued work**: what still waits for this organization, such as
  notification and webhook deliveries, files to delete, bulk, report and export
  jobs, open data subject requests and running integration syncs.
- **Last retention run**: its status and when it ended, with a link to the run.

Services, the database and background jobs are shared by every organization on
the platform. Queued work and the retention run are this organization's only.
The overall status is the worst of the services and the jobs. If the page
cannot be read at all, the backend did not answer, and the platform itself may
be down.
