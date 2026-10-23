# Retention plan

**Compliance → Retention plan** is a dry run of the nightly retention run: for
each active policy (and the consent window of the organization settings) it
counts the rows a run would purge, and the rows past their retention that a
legal hold keeps. It changes nothing: nothing is deleted, anonymized or
archived, no retention run is recorded and no file is queued for deletion.

- **As of**: **Now**, or as if the run happened **in 7 days** or **in 30
  days**. Each cutoff is that moment minus the policy's days, so looking ahead
  shows what will become due. Legal holds are always judged as they stand now.
- Each row shows the **data class**, its **scope** (a facility, or the whole
  organization), the **action**, how long rows are kept, the **cutoff**, the
  rows the run **would purge** and the rows **kept by holds**, with a link to
  the policy.
- **Count again** reads the plan once more; the time of the count is shown
  under the table.

The seeded policies keep at least 31 days, so right after the demo data is
seeded the plan reads 0 everywhere.
