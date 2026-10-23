# Integrations

An **integration** connects the organization to another system. **Compliance →
Integrations** lists them with their kind, status, whether a secret is stored and
the last sync.

| Kind | What a sync does in this demo |
| --- | --- |
| **HR system** | Real: applies the HR fixture file (CSV or JSON) to the profiles through the field mapping. |
| **SIEM**, **Webhook** | Stub: counts the events since the last sync and sends nothing. |
| **Building management** | Stub: counts the occupancy rows and sends nothing. |
| **ERP**, **Custom** | Stub: an empty run. |

The outbound connectors are stubs on purpose: the run, its counts, the failure path
(status **Error**, an **Integration failed** event) and the schedule are real, only
the call to the outside world is left out.

## Settings and field mapping

- **Settings** is a JSON object: `endpoint` and other connector options; for an HR
  integration `fixture_file_id` (the uploaded fixture) and `external_id_field` (the
  source field that identifies a person); `simulate_error` makes every sync fail
  with that code, to demonstrate a failure. The page shows the schedule as a
  sentence and every other setting by name.
- **Field mapping** (HR) says which source field fills which profile column, such
  as `"GivenName": "first_name"`. A record whose value does not fit is skipped
  with a code.
- **Kind** is fixed once the integration is created.

## Schedule

**Schedule** (in **More**) sets when the integration syncs by itself: a cron, read
in the chosen time zone, with its sentence under the input. Leave the cron empty
to remove the schedule. Schedules are checked every 15 minutes, so a run can start
up to 15 minutes late; a **Paused** integration does not sync, by hand or on
schedule.

## The secret

An API token or password is stored with **Set secret**. It is **write-only**:

- it is encrypted on the server and never shown, read back or put in the page's
  address or storage: the page only says **Secret stored** yes or no;
- **Set secret** replaces a stored one; **Clear secret** (offered only while one
  is stored) removes it;
- never put a password in **Settings**: settings are readable by every
  administrator.

## Run sync and the sync log

**Run sync** starts a sync now and opens its **run**, which follows the
background job until it ends. A run says what it **read** and **wrote**, how many
profiles were **created**, **updated** or **deactivated** (HR), what it
**skipped** and why (**Problems**: the row and a code, never the values), and the
**error** of a failed run. An HR sync never updates or deactivates a person under
restriction of processing and never brings back a person erased by a data subject
request. Repeating the same fixture writes nothing.

Only one run of an integration runs at a time, and a paused integration does not
run. A failed sync sets the integration to **Error** until a sync succeeds.
**Compliance → Sync runs** lists every run of every integration, newest first; it
is a log: nothing in it is ever changed.
