# ITAP Console Phase 4 — People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profiles (known people) with documents, consent, processing restriction and duplicate
review; identities (tracked faces) with photos, enrollment, merge/rollback/split, duplicates,
verification, relationships and timeline; visits with check-in/out.

**Architecture:** A new `people` ConsoleModule (conventions: `summary-00..03`, `IMPLEMENTER-CONTEXT.md`).
Every state change goes through the data layer's functions/actions as `defineMutation` + flows; no
client-side state machines. Reusable pieces added: `itap:photo-gallery` block, `itap:webcam-capture`
(getUserMedia → JPEG files uploaded with `storageFile` plumbing), `itap:identity-timeline` block.

**Tech Stack:** as before; no new dependencies (webcam via `getUserMedia` + canvas).

**Spec:** `tasks/ui/design.md` §6.4 + §10 call 2 (face images: upload + webcam, server-side quality);
data model `tasks/data-layer/design.md` §6.2–§6.4, §7, §8.1 (merge, restriction, consent effects),
§8.5 (actions `enroll_face`, `create_identity_from_photos`, `add_identity_photos`,
`upload_profile_document`, `open_file`).

## Global Constraints

- Earlier plans' Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Before Task 1: fix data-layer issue bd `3v_mono-ryj` (org_admin can upload sensitive file kinds
  into the org bucket) as its own small data-layer change (migration/metadata/test following
  `.claude/rules/hasura-conventions.md`), because profile documents are sensitive.
- Profiles are never deleted (no delete permission); lifecycle by status. Erased profiles
  (`erased_at`) are read-only tombstones; restricted profiles (`processing_restricted`) show a banner.
- Profile documents are uploaded only through action `upload_profile_document` (base64 in the
  action) and opened only through `open_file` (audited); they never use direct storage upload.
- Face photos: org-bucket files of the kinds the actions expect (check `enrollment`/`capture` kinds in
  the backend); quality is decided server-side; the UI shows the action's per-photo result.
- `customFields` is used on profiles and identities: never mount two inputs of the same entity on one
  screen (G17 shared snapshot).
- Merges/splits/rollbacks are irreversible-looking operations: every such flow has `confirm` and a
  `review` step showing what moves.

## Review Focus

1. Enrolling a face with a photo that fails quality shows which photo failed and why; nothing is
   half-enrolled silently. — Task 3 test.
2. Merging identities then rolling back restores both identities' photos and links exactly (server
   decides; UI reflects it after refetch). — Task 4 dev-stack test.
3. A restricted or erased profile cannot be edited in fields the server freezes, and the UI says why
   (rules with `fallback: 'disable'` + reason). — Task 2 test.
4. A sensitive document link opened after its short-lived URL expired re-requests a URL instead of
   failing. — Task 2 test.
5. Checking in a visit that is cancelled or already checked out is not offered. — Task 5 test.

---

### Task 0: Data-layer fix — sensitive kinds cannot be uploaded by org_admin (bd 3v_mono-ryj)
Reproduce with the skipped phase-0 test (unskip), fix in the data layer (storage insert check or a
trigger on `storage.files` metadata — choose what works with hasura-storage 0.7.2 writing metadata
after insert), migration + regenerated metadata + test, close the bd issue. Commit `fix(hasura): …`.

### Task 1: Profiles core
Resource `profile`: record `types` by `profile_type` (employee: employee_id, department, job_title,
work_schedule_id; visitor: host/company; contractor: company, end_date; vip), first/last name, email,
phone, company_id, access_level, start/end dates, avatar (`storageFile` image), notes, custom_fields
(`customFields({ entity: 'profile' })`), status, computed `has_face`/`is_blacklisted`/`identities_count`
(system, badges), restriction/erasure columns (system). List with saved views (Employees, Visitors
today, Blacklisted, Pending face link), search, filters. Show tabs: details, identities (relatedList),
documents, consent, visits (Task 5 fills), activity (`profile_activity_stats` facts). Company show page
gets its profiles relatedList (deferred from phase 1). Docs + article (profile vs identity concept).
Commit `feat(ui): profiles`.

### Task 2: Documents, consent, restriction, profile duplicates
`profile_document` (list per profile; "Upload document" flow: file input → base64 → `uploadProfileDocument`
mutation; display opens through `open_file`, re-requesting expired URLs), `consent_record` (grant /
withdraw flows; withdrawal effects documented), `setProcessingRestriction` flow (reason required; rules
disabling frozen fields with reasons for restricted/erased), `profile_duplicate_candidate` review queue
(compare block side by side; "Merge profiles" flow over `merge_profiles` with review; "Dismiss").
Commit `feat(ui): profile documents, consent, restriction and duplicates`.

### Task 3: Identities and enrollment
Resource `identity` (status, profile link with link strength, attributes, first/last seen, detection
count, primary photo, source, matching_enabled, is_synthetic), photo gallery block (`identity_photos`),
webcam capture block, flows: "Create identity from photos" (resource flow: upload or capture 1–5 photos →
`create_identity_from_photos`), "Add photos" (item), "Enroll face" on a profile (`enroll_face` with
photos), showing per-photo quality results from the action output. Commit `feat(ui): identities and enrollment`.

### Task 4: Identity governance and timeline
Flows: "Merge identities" (bulk flow over selected identities → choose target → review → `merge_identities`),
merges list with "Roll back" (`rollback_merge`), "Split" (`split_identity`), `identity_duplicate_candidate`
queue (merge/dismiss), `verification_request` queue (approve/reject with reason), `identity_relationship`
CRUD on the identity page, `itap:identity-timeline` block over `identity_timeline`. Commit
`feat(ui): identity merges, verification and timeline`.

### Task 5: Visits
Resource `visit` (number, visitor/host profiles, company, purpose, expected window, status, badge,
checked in/out), flows check-in / check-out / cancel over the SQL functions with `when` on status,
saved views (Today, Expected now, No-shows), profile and company related lists. Commit `feat(ui): visits`.

### Task 6: Phase close
e2e `people.spec.ts` (create a visitor with a visit and check in/out; upload and open a document;
create an identity from a photo; merge two identities and roll back; approve a verification), gates,
demo `phase-04-people.webm`, `summary-04-people.md`, gaps/roadmap, push.
