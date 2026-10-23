# Summary — phase 10: Access control

Plan: `plan-10-access.md`. Data model `tasks/data-layer/design.md` (slice 8, physical access:
policies with four-eyes approval, grants, emergency overrides, `itap.evaluate_access`, terminal sync).
Framework gaps: `buro-gaps.md` (G73–G77; G72 measured again). Branch `feat/ui-console`, base
`553169b`: access policies `c211091`, grants and decisions `84a7299`, emergency overrides and
terminal sync `d707163` + review follow-ups `6a9b373`, then the access smoke suite, a publish intro
wording fix and this summary.
Demo video: `playwright-output/phase-10-access.webm`. It shows:
- a policy drafted to keep one seeded person out of one door, its Who and Where lists, the
  simulation over the last 7 days;
- the draft made valid from 2099 and submitted with its review, Approve disabled for the submitter
  with the four-eyes tooltip, sign-out and approval by the second Nova admin, the Approval tab;
- a single-use grant, "Test access" at the door with its trace, the decision page, the grant
  reading Used;
- an evacuation started with the banner, its Terminals tab, the dashboard under the banner, "End
  now" with a reason and the terminals receiving the end;
- the Terminals page and "Publish policy to terminals" answering per terminal.

The video is git-ignored like the earlier ones; everything it wrote was removed afterwards.

## What was built

All in `apps/admin-ui/`, in a new `access` ConsoleModule (`src/modules/access/`), nav section Access
control (Access policies, Policy versions, Access grants, Access decisions, Emergency overrides,
Terminal sync log, Policy analytics, Terminals).

- **Access policies** (`access_policy`): code, name, description, the version in force, archived.
  Views In force / Never approved / Archived. **Draft a change** (`create_access_policy_draft`,
  idempotent: opens the open version, else a copy of the version in force) and **Archive**
  (`archive_access_policy`, confirm). Delete is disabled with a reason while a version is in force.
- **Policy versions** (`access_policy_version`): effect, priority (0..1000), schedule
  (`timeWindows({ emptyText: 'Always' })`), valid from/until (checked in order), maximum risk (allow
  only). Tabs Settings / Who / Where / Approval / Decisions.
  - Who and Where: on a draft, one titled list per kind (people, segments, profile types, minimum
    access levels; facilities, areas, access points), twin resources per kind (G45 pattern); on any
    other version the whole set, read only. Targets are not facility-scoped: an approver sees every
    place.
  - **Submit for approval**, **Approve**, **Reject** (reason), **Roll back to this version** (a new
    draft copied from a superseded version). Submit and Approve show what is submitted or approved
    (`itap:access-policy-version-review`, read fresh) in a form body.
  - Four-eyes (Review Focus 1): the submitter sees **Approve disabled** with the reason as its
    tooltip; a forced call is refused (`four_eyes_required`, mapped). A pending version is frozen:
    Edit and Delete are disabled with a reason, its subjects and targets read only.
  - **Simulate** (Review Focus 2, G73): a sheet with `itap:access-policy-simulation` over the last
    24 hours, 7 days or 30 days. It counts decisions granted → denied, denied → granted and decided
    for another reason, and lists the changed decisions with names. It writes nothing (checked by
    the dev test and the smoke suite).
- **Policy analytics** page: decisions, policies in force and unused, conflicting overlaps, denial
  reasons, top denied people, grants, per-version hits (`policy_analytics`).
- **Access grants** (`access_grant`): person, area or access point (exactly one), validity, single
  use, reason; never edited.
  - **Revoke** with a reason. It is not offered once revoked or used up, and is disabled with a
    reason once expired.
  - Use (Review Focus 4, `itap.grant-use`): Unused / Used with the moment / Reusable.
  - Views Not revoked / Single use, unused / Used / Revoked.
- **Access decisions** (`access_decision`, append-only: `noAggregate`, cursor, manual count).
  - Result and reason enums, risk, links to facility, door, device, person, face, detection, policy
    version, grant and override.
  - The trace block `itap:access-decision-trace` (Review Focus 5) shows how the door decided:
    overrides, the person, each policy in evaluation order with its outcome, grants, the risk parts
    that add up to the score, epoch and time zone.
- **Test access** on an access point (`check_access`): a person or a face. The decision is recorded
  and shown with its trace and a link to the decision page. It is a real decision, so a single-use
  grant is used up, as the dialog says. Profile and access point pages have an Access tab (grants,
  decisions).
- **Emergency overrides** (`emergency_override`).
  - **Start override**: facility, mode, areas, an end at most 24 hours away and a justification of
    10+ characters; the client checks mirror the CHECKs.
  - **End now**: a reason; disabled with a reason once run out.
  - Tabs Details / Areas / Terminals / Decisions.
  - The shell banner (G76) lists the active overrides of the sidebar facility (all when none is
    selected) above every page and links each one.
- **Terminal sync** (Review Focus 3).
  - Block `itap:terminal-sync-status`: Current / Behind / Never synced / Unreachable against the rule
    set; Received / Not yet / Unreachable against an override. It is on the override page, the device
    page and the **Terminals** page.
  - The sync log `terminal_policy_sync` (append-only).
  - **Publish policy to terminals** (app action, G77) pushes the rule set to the sidebar facility's
    terminals (or every facility's) and answers per terminal by name.
- **Data layer:** no data-layer changes this phase (no migration, no metadata, no backend change;
  `git diff 553169b..HEAD -- apps/nhost apps/backend packages` is empty).

## Reusable for later phases

- The four-eyes pattern: a rule on `ctx.user.id` against the submitter, Approve disabled with the
  reason, the database refusal mapped; a form-hosted review block for confirm-like flows.
- A read-only "dry run" as a modal action placing a block in a sheet (G73), as phase 6's Test rule.
- Lenient trace parsing (`traceOf`, zod `.catch`) for engine JSON whose shape may grow.
- The database-clock lost-answer check (`latestDoorDecision`, a baseline read when the dialog opens)
  for actions without a correlation id; the terminal state helpers (`terminalState`, `terminalsOf`).
- The shell banner place in `app.tsx` (G76), for any app-wide notice.
- `e2e/access-support.ts`: a second admin's own browser context (`signInSecondAdmin`) for four-eyes
  flows, and a run cleanup that waits for the urgent terminal push its own deletes cause.

## Rulings (from the ledger)

- **Approve disabled with the reason satisfies Review Focus 1** ("not offered to the submitter").
  The plan's Global Constraint says "rule with reason". The cost is a visible but inert button; the
  gain is a stated reason. The submitter can still Reject to take the version back.
- **Maximum risk is not cleared when a version becomes a deny** (G74): hidden fields are not sent as
  `null`. The engine reads `max_risk` on an allow only, so a stale value decides nothing.
- **Grants span facilities**: `access_grants` has no `facility_id`, so the grant list is not narrowed
  by the sidebar facility (its article says so).
- Review minors moved forward: Task 1's into Task 2, Task 2's (and "grants span facilities") into
  Task 3.
- Task 3 fix round 1 was not re-reviewed: text and doc fixes plus a dev test, suite green. It made
  every override end urgent, worded lazy sync as "within 15 minutes", made publish name its scope and
  had the banner read the facility name through the relationship.

## Found by the smoke suite and the demo

- The Terminals page intro read "every access terminal of every facility (the facility selected in
  the sidebar)" when no facility was selected. The scope text now carries its own note: "every
  facility (none is selected in the sidebar)" or "<facility> (the facility selected in the sidebar)".
- Approving a version is an urgent epoch bump: every reachable Nova terminal held the new epoch within
  seconds; Turnstile Terminal 4 (seeded offline) reads Unreachable.
- A draft saved through the edit form, with `policy { is_archived }` in the selection (G75), works in
  the browser (Task 2 concern 1).
- G72 does not hit the confirm-only **Archive** and **Roll back to this version** (launched from the
  "More" menu). In a real browser Archive showed "… is archived." and Roll back showed its toast and
  opened the new draft (a scratch probe; `buro-gaps.md` G72 notes it). Task 1's concern 5 is
  withdrawn.
- The "Submitted by" and "Approved by" columns show a user id for the seeded admins (their
  `displayName` is empty, as in phase 8).
- The profile pickers list 42 "Ada e2e-…" profiles left by earlier phases' runs on 2026-10-22; this
  phase did not write them.

## Framework gaps met

- G72 confirm-only flows lose their `then` effects in a real browser: measured, not met here
  (see above).
- G73 a flow cannot submit a read-only query (Simulate is a modal block).
- G74 a field hidden by a condition keeps its stored value (maximum risk on a deny).
- G75 a record page cannot read a related record's column (`policy { is_archived }` in
  `selectFields`).
- G76 the shell has no banner slot (the override banner is app composition).
- G77 an app flow cannot have form fields (Publish uses the sidebar facility).

## Deferred and residues

- Publish has no facility field (G77). The banner scrolls with the page and adds one read every 30 s
  (G76).
- "Received" is judged by `synced_at >= started_at/ended_at`. A sync whose payload was built a few
  ms before the end and recorded after it would read Received. An epoch-based judgement needs the
  epoch at the end, which the override row does not carry.
- Start override's lost-answer check matches the exact `ends_at` sent. Chosen areas are not reset
  when the facility changes; the server refuses a stale area (`area_not_found`).
- Parked minors:
  - the shared `version_status` enum keeps the event-rule wording (access uses its own);
  - the review block formats the schedule with locale `'en'`;
  - a policy version link in decision lists shows the version number only;
  - the console requires a revoke reason although the database accepts none.
- Live counters: the dev tests and the smoke suite advance the policy epoch counters and the
  terminals' sync state; these are not rows to delete.
- Dev-test residues: the Tasks 1–3 dev tests leave approval audit rows and sync log rows (logs).
- Smoke suite and demo residues: none. They remove, with the admin secret (cleanup only):
  - the run's policies (versions, subjects, targets) and grants;
  - the decisions they recorded, with their events and fan-out;
  - the overrides, with their areas and events;
  - the audit rows of all of them;
  - the facility's sync log rows since the run began, after waiting for the urgent push the cleanup
    itself causes;
  - the settings row's retention audit rows of those epoch bumps.

  Residual check after the final run: 0 policies, grants, overrides, decisions, events, sync rows and
  audit rows.

## Gates

- **Console suite**: ran once with `ITAP_DEV_STACK=1`. 158 files, 1175 tests, all passed.
- **e2e**: `access.spec.ts` 5 passed (about 1.5 minutes).
- **Static checks**: lint, typecheck and build are clean.

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed  # dev stack, migrations and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts access.spec.ts
pnpm --filter admin-ui build
```

`access.spec.ts` signs `nova.admin@itap.demo` (the second Nova admin, the four-eyes approver) in
within a browser context of its own. A run therefore uses two sign-ins: the shared admin state plus
this one. It needs `GRAPHQL_ADMIN_SECRET` for its cleanup. Its cleanup waits 15 s for the urgent push
its own deletes cause. Run specs by file, never the whole e2e suite. Sign-in is limited to ten per
five minutes.
