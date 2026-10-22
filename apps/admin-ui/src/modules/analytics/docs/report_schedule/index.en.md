# Report schedules

A schedule runs a report template regularly and delivers each report. The
scheduler checks every 15 minutes, so a report is made within 15 minutes of
its time.

## When it runs

**When** is a cron: five fields separated by spaces, read in the
schedule's time zone.

| Field | Values |
| --- | --- |
| minute | 0–59 |
| hour | 0–23 |
| day of the month | 1–31 |
| month | 1–12 |
| weekday | 0–7 (0 and 7 are Sunday, 1 is Monday) |

Each field is `*` (any), a number, a range `a-b`, or a list `1,15`, each
optionally with a step `/n` (`*/15`: every 15 minutes). Names (`MON`) and
`?`, `L`, `W`, `#` are not accepted. The form shows what the cron means as
you type it:

- `0 7 * * *` — at 07:00 every day;
- `0 7 * * 1-5` — at 07:00 on Monday–Friday;
- `0 7 * * 1` — at 07:00 on Monday;
- `30 6 1 * *` — at 06:30 on day 1 of the month.

When both the day of the month and the weekday are restricted, a day
matching either runs (`0 7 1 * 1`: the 1st and every Monday). A cron whose
days exist in none of its months (`0 7 30 2 *`) never runs; the form says so.

## Runs

- **Next run** is planned by the scheduler; changing the cron, the time
  zone or switching the schedule on or off clears it until the next check.
- Each run reports on the previous complete period of the template
  (previous day, week or month) before the run, in the schedule's time zone.
- A run that fails is recorded as **Last error**; the schedule moves on to
  its next run, and the next successful run clears the error.
- Switching a schedule off pauses it. Deleting it keeps the reports it made.
