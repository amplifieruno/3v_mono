# ITAP Console Phase 5 — Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What happens in the building, live and historical: detections, tracking sessions and paths,
occupancy, events, event rules with versions, incidents with their full lifecycle, watch lists, shift
handovers, and an operator workspace.

**Architecture:** A new `monitoring` ConsoleModule (conventions: `summary-00..04`,
`IMPLEMENTER-CONTEXT.md`). Logs are read-only cursor lists with filters and saved views; state changes
go through the data layer's SQL functions as `defineMutation` + flows (`acknowledge_incident`,
`start_investigation`, `escalate_incident`, `resolve_incident`, `close_incident`,
`create_event_rule_draft`, `publish_event_rule_version`, `acknowledge_shift_handover`,
`generate_incident_report`). Lists that operators watch poll (`refetchInterval`) until buro's live
fix ships.

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.8–§6.9, §8.2 (pipeline,
dedup), §6.0 (versioned entities).

## Global Constraints

- Earlier plans' Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Append-only logs (detections, identity_locations, events, incident_activities) use `noAggregate`,
  `count: 'manual'`, cursor pagination, `operations` all off; columns resolve people/places through
  relations and dotted columns.
- Event rules follow the versioned pattern: header + versions; editing = editing the draft version;
  publishing = `publish_event_rule_version`; history as a timeline relatedList; a version with
  decisions/events is never deleted.
- `event_rules.rule_type` parameters differ per type: record `types` on the version resource by the
  header's rule type (or a `parameters` custom field type keyed by rule type — choose the buro-native
  one that works and document it).
- Incident lifecycle buttons appear only in states where the function accepts them (`when` on status),
  and show the server refusal message otherwise.
- Every incident action that changes state writes `incident_activities` server-side; the UI shows the
  activity timeline, never fakes entries.

## Review Focus

1. An operator acknowledges an incident another operator already acknowledged: the second click shows
   the server outcome and the incident page refreshes, no duplicate activity. — Task 3 test.
2. Publishing a draft rule version while another draft exists for the same rule is refused clearly. —
   Task 2 test.
3. A detection of an unknown person links to the new identity and its photo; a detection whose identity
   was erased shows "erased" instead of failing. — Task 1 test.
4. The occupancy view and the area tree agree with `facility_occupancy_now` for the selected facility.
   — Task 1 test.
5. Closing a shift handover with open incidents lists them for the next operator. — Task 4 test.

---

### Task 1: Detections, tracking sessions, locations, occupancy

Carry-overs from phase 3 (`summary-03-devices.md`): before the operator workspace reuses `openDetectionStream`, multiplex detection rooms over one socket per session (the backend accepts several `join-device` on one socket) and add a "Reconnect" action after repeated `unauthorized` refusals. Do this in Task 1 so Task 4 builds on it.
Resources `detection` (thumbnail via `storageFile` display, identity/profile/device/area relations,
confidence, new-identity flag; filters by facility/area/device/time/known-unknown; saved views),
`tracking_session` (path tab = timeline of `identity_location`), `identity_location`, `area_occupancy`
(who is where now, per facility, polling); "Occupancy now" custom page with the floor-plan block coloured
by occupancy and a per-area list. Identity and profile pages get detections/sessions tabs.
Commit `feat(ui): detections, tracking and occupancy`.

### Task 2: Events and event rules with versions
Resource `event` (type/severity enums with colours, relations to place/person/device/rule version,
payload json, saved views by severity, polling), event rule header + versions + scopes (junction via
relatedList + read link), draft editing with per-type parameters, publish flow, test/replay if a function
exists (else defer and log), incidents created by rule shown on the rule. Commit `feat(ui): events and event rules`.

### Task 3: Incidents
Resource `incident` (number, title, description, severity, status, disposition, place, assignee,
escalation policy/step, timestamps), lifecycle flows (acknowledge, start investigation, escalate,
resolve with disposition + resolution, close), notes with files (`incident_note_files` via storageFile),
linked events and identities (junction relatedLists + read links), activity timeline,
"Generate incident report" flow (`generate_incident_report`; the report itself lands in phase 8).
Commit `feat(ui): incidents`.

### Task 4: Watch lists, shift handovers, operator workspace
`watch_list` + `watch_list_entry` (identity or profile target — exactly-one, use record types or two
create flows; expiry), `shift_handover` (+ incidents junction; acknowledge flow), operator workspace
custom page (the operator's default layout: live wall of cameras of the selected facility, open
incidents list, latest critical events, occupancy facts) persisted in `operator_workspaces.layout`.
Commit `feat(ui): watch lists, shift handovers and operator workspace`.

### Task 5: Phase close
e2e `monitoring.spec.ts` (filter detections by an area, open a session path, acknowledge → investigate →
resolve a seeded incident with a note, publish a new rule version, add a watch-list entry, acknowledge a
handover), gates, demo `phase-05-monitoring.webm`, `summary-05-monitoring.md`, gaps/roadmap, push.
