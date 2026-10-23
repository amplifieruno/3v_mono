# Bulk jobs

A **bulk job** applies many rows at once, in the background: it creates
profiles from a CSV file, updates profiles from a CSV file, or runs one face
search per photo. Bulk jobs are under **Search › Bulk jobs**.

## Starting a job

The list has one button per kind of job:

- **Import profiles**: upload a CSV file; each row becomes a new profile.
- **Update profiles**: upload a CSV file and choose how each row finds its
  profile: by **employee ID**, **email** or **profile code**.
- **Bulk face search**: add the face photos to search for. The console uploads
  them for you and writes the job's input file itself.

**Dry run** (profile jobs) checks every row exactly as the real run would, and
saves nothing: each row comes out **Valid (dry run)** or **Failed**. Run it
first on a large file.

A bulk face search takes the **threshold** (it starts at the organization's
default) and the **results at most** per photo, as on the Search page.

Once queued, a job is fixed: its kind, file and options never change. To run
other rows, start a new job.

## The CSV file

The first row is the header naming the columns, in any order (upper and lower
case alike). The file is UTF-8 text, at most 5 MB and 10,000 rows. A blank row
is skipped. A column the job does not read fails the whole job before any row
is applied.

**Profile import** columns: `first_name` and `last_name` (both required),
`email`, `phone`, `profile_type` (`employee`, `visitor`, `contractor`, `vip`),
`company` (its name or ID), `department`, `job_title`, `employee_id`,
`start_date` and `end_date` (`YYYY-MM-DD`), `access_level` (`basic`,
`standard`, `elevated`, `admin`), `work_schedule` (its name), and
`custom.<key>` for each custom attribute of profiles. A sample:

```csv
first_name,last_name,email,profile_type,company,start_date
Ada,Lovelace,ada.lovelace@example.com,contractor,Acme Corp,2026-11-01
Alan,Turing,alan.turing@example.com,visitor,,
```

**Profile update** columns: the key column you chose (`employee_id`, `email`
or `code`) and at least one of the import columns. An empty cell leaves that
value as it is; the key column itself is never changed. A sample, by employee
ID:

```csv
employee_id,department,job_title
E-1042,Security,Shift lead
E-1043,,Receptionist
```

**Bulk face search** columns, if you write the file yourself: `image_file_id`
(a search photo you uploaded) and `label`. The **Bulk face search** button
writes this file for you from the photos you add, with each photo's file name
as its label.

## Following a job

The job's page follows it live: how many rows have been read of the file's
total, and how many **succeeded**, **failed** and were **skipped** so far. It
checks every few seconds while the job is queued or running.

When the job ends, its status says how:

- **Completed**: every row succeeded or was blank.
- **Partly failed**: some rows failed; the others were applied.
- **Failed**: the job could not run (for example a wrong header), or every row
  failed. **Error** says why.
- **Cancelled**: a member stopped it.

The counts always add up: succeeded, failed and skipped rows, plus the rows a
cancelled job never reached, make the file's total.

## Rows

The tabs list the rows by outcome: **Failed rows** first, each with the reason
in words (an empty required column, a company that does not exist, a date not
written as `YYYY-MM-DD`, no face in the photo…), then **Succeeded** and **All
rows**. A profile row opens the profile it created or updated; a search row
shows its best match, the similarity and the search with all its results.
Nothing of a failed row is saved. Rows are read only.

The **Result file** lists every row with its outcome, the profile or identity
and the error, as CSV.

## Cancel and Retry

**Cancel job** stops a queued or running job at its next row. The rows applied
before stay applied; the job does not continue.

**Retry** is offered when the job failed or partly failed. The rows that
succeeded are kept; only the failed rows (and any the job never reached) run
again. Retry is not offered once the input file was deleted.

## Who sees what

Profile jobs are organization work: every administrator sees them and their
rows. The input file opens only for the member who started the job. A bulk
face search, its rows, its result file and its searches are visible to the
member who started it only, like the search history.
