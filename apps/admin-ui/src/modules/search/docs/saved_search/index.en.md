# Saved searches

A **saved search** keeps a face or attribute search so it can run again: by
hand with **Run now**, or by itself on a schedule that can alert you when it
finds someone new. Saved searches are under **Search › Saved searches**.

## Saving a search

**New saved search** opens the same form as the Search page: what to search by,
the photo, the filters, the threshold, the number of results and fuzzy matches
(see the search article). Give it a name, and optionally:

- **Shared**: every member of the organization sees it, read only. Only you
  change it, delete it or have it run on a schedule.
- **Schedule**: when it runs by itself, as a cron in the organization's time
  zone, for example `0 7 * * 1` for Mondays at 07:00. The form shows the
  schedule in words. The scheduler looks for due saved searches every hour.
- **Alert on new matches**: see below. Alerts come from scheduled runs only.

The form picks one identity status and one profile type. A saved search whose
stored filter lists several (made outside this form) opens in **Edit** with the
first of them only: saving it with the search unchanged keeps them all, but
saving a changed search keeps only that first value.

## Run now

**Run now** runs the saved search once, as you, and opens the run in your
search history with its results. It is a search by hand: it leaves the
schedule, the last run and the alert baseline as they are, and it raises no
alerts.

Another member's shared **attribute** search can be run by anyone. A shared
**face** search can be run only by its owner: its photo is visible to the owner
alone.

## Scheduled runs and alerts

Each scheduled run is a search in the owner's search history; the saved search
page lists them under **Scheduled runs** and shows the last completed run's
results under **Last scheduled run**. **Last run status** says how the last
scheduled run ended:

- **Completed**: it searched; its results are the last results.
- **Failed**: it could not search, for example because the photo was deleted;
  **Last error** (shown to the owner) says why.
- **Skipped**: the owner is no longer an active member, so nothing ran.

With **Alert on new matches**, each scheduled run raises a *saved search
match* event for every identity it finds that the previous completed run did
not find. Those events go through the notification rules like any other event.

## The alert baseline

New matches are counted against the previous completed run: the **baseline**.
There is none:

- before the first scheduled run, and
- after the search itself was changed: its type, photo, filters, threshold,
  number of results or fuzzy matches.

The run without a baseline only records what it finds and raises no alerts;
alerts resume from the run after it. The page says **No alert baseline yet**
while this is so, and the edit form asks you to confirm before saving a changed
search. Renaming, sharing, rescheduling or switching alerts keeps the baseline.

## Shared with you

A saved search someone else shared is read only: **Edit** and **Delete** are
disabled with the reason. Its photo, its runs and their results belong to its
owner's search history and are not shown to you.
