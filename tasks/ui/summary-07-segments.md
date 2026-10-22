# Summary — phase 7: Segments

Plan: `plan-07-segments.md`. Spec: `design.md`; data model `tasks/data-layer/design.md` §6.5, §8.3.
Framework gaps: `buro-gaps.md` (G54–G56, G34 and G23 extended). Branch `feat/ui-console`, base `429b3aa`:
segments, templates and stats `d968e88` + review fixes `249b2c8`, conditions editor `6dcd9f2` + review
fixes `5869d62`, preview, evaluation and membership `c916ad1`, membership review follow-ups `abd5a75`,
then the segments smoke suite and this summary. Demo video: `playwright-output/phase-07-segments.webm`
(the segments list and templates, a dynamic segment built in the conditions editor with its live preview,
saved and deleted, Evaluate now on a dynamic segment with the Members and Trend tabs, the person's Segments
tab, Add members by hand and Remove from segment; git-ignored like the earlier videos).

## What was built

All in `apps/admin-ui/`, in a new `segments` ConsoleModule (`src/modules/segments/`), nav section People
(Segments, Segment templates).

- **Segments.** `segment` with kind and target fixed at creation (`write: 'create'`), status, colour,
  icon, conditions, active window and schedule (`timeWindows({ emptyText: 'Always' })`: the column is the
  shared `valid_windows` shape), and the server's member count, last evaluation and evaluation error.
  Conditions, window and schedule are shown only on dynamic segments. Saved views Active, Dynamic, Manual,
  Of profiles, Of identities, Evaluation failing, Archived. Tabs Details, Members, Trend, Event rules
  scoped to it. Delete is a custom flow whose refusals (`segment_referenced`, the NO ACTION foreign keys)
  say why and to archive instead (G54). Archiving a segment that event rules are scoped to asks first.
- **Templates.** `segment_template`: built-in templates are read-only, own templates are editable;
  **Create segment** makes a dynamic segment with the template's target and conditions and opens it.
- **Daily figures.** `itap:segment-stats` block (members line, added/removed bars over 30 days, days in the
  organization's calendar) and the daily figures list on the Trend tab.
- **Conditions editor** (`src/fields/segment-conditions*.ts(x)`, `itap.segment-conditions`): a tree of
  groups (all / any / not) and conditions driven by the `segment_fields` catalog (field, operators per
  type, value editors for text, numbers, yes/no, empty/not empty, enum values, references with a search
  picker, lists, ranges, dates and times with "days from today"). A client validator mirrors
  `validate_segment_node` exactly and puts every problem on its node by the JSON path the database
  would name; a field the catalog no longer offers stays in the tree, flagged, and blocks the save
  (Review Focus 1); a `segment_condition_invalid:<path>` from Create segment or the preview names the
  node (Review Focus 2). One readable sentence shows the conditions in lists, pages and above the editor.
- **Preview and evaluation.** `itap:segment-preview` on the create and edit forms of dynamic segments:
  `preview_segment` with the conditions on screen, count and first matches as links, nothing created
  (Review Focus 3). **Evaluate now** on an active dynamic segment (`evaluate_segment`) shows who joined
  and left by rule, the member count, or that a newer evaluation had already run (a review step hosts the
  answer, G55).
- **Membership.** Read-only twin resources `segment_profile_member` / `segment_identity_member` over
  `segment_members` (G45 pattern); the segment's Members tab (current members, earlier memberships) and a
  Segments tab on profiles and identities. **Add members** on a segment (one flow per target, a
  multi-select: the console's bulk add, G34), **Add to segment** on a profile or an identity, **Remove from
  segment** on an open manual membership. Adding a rule member pins them as a manual member (Review
  Focus 4). The add flows say how many memberships the call opened and how many chosen people were already
  added by hand; the remove flow says how many ended (0 when someone else had ended it).
- **Wiring.** Event rule scopes' `segment_id` is a relation to the segment; notification conditions read
  the segment resource; refusal maps for the membership functions and the actions are in the
  `ACTION_REFUSALS` key-list test.
- **Data layer, migration `1792365700283`:** computed field `segment_members.opened_now`
  (`created_at = now()`, true only inside the inserting transaction), so the answer of
  `add_segment_members` (every open manual membership of the given ids) tells the rows that call opened.

## Reusable for later phases

- `segmentConditions({ targetField })` and the condition sentence (`segment-conditions-format.ts`) for
  access policy subjects, client application segments and report filters that name segments.
- The segment resource as a relation target (rule scopes, notification conditions; access policies,
  face-auth bindings and reports in phases 8, 10, 11).
- `opened_now`-style computed fields when a write's answer must tell what it changed.
- The stats block pattern (organization calendar days, line + bars) for analytics.

## Rulings (from the ledger)

- Archiving a referenced segment is allowed by the server (only delete is refused, §6.5): the console
  confirms when event rules are scoped to it and lets it through.
- No bulk "Add to segment…" from the profile and identity lists (G34: a bulk flow has no form, so the
  segment cannot be chosen); "Add members" on the segment with a multi-select and "Add to segment" on one
  record cover it.
- Evaluate now opens a review step first: it is the only way to host its answer block (G55).
- Task 2 minors parked (unreachable from the editor's inputs or cosmetic): `Date.parse` leniency and zone
  names, trim vs `btrim`, focus management after move/remove/add, one validator registry per target.
- Task 3 review minors 1–4 were fixed in `abd5a75` (the added count, the remove count, the dev test's
  archived refusal and its independence); minors 5–8 were parked as cosmetic.
- The added count is read from the server (`opened_now`) rather than compared with a list read before
  the call, which could miss rows beyond a page and race with other writers.

## Found by the smoke suite and the demo

- The editor's first "Add condition" makes the condition the whole tree; the second wraps both in an
  "All of these hold" group (the suite follows the paths `$`, then `$.children[1]`).
- The profile picker names a person by last name only, with the id to tell namesakes apart; the suite
  picks the option by id. The member lists show the last name too (profile display field, phase 4).
- A closed enum select shows the chosen value's help text in its trigger and overflows (G56, cosmetic).
- The fixed segment's Members tab lists earlier memberships of earlier runs: the suite targets the open
  membership's row by id.

## Framework gaps met

- G54 the built-in Delete cannot say why the database refused it.
- G55 a flow without a form or a review cannot show its answer in a block.
- G56 a closed enum select shows the option's help text in its trigger.
- G34 extended (no bulk "Add to segment…"), G23 extended (count-neutral sentences, no zero case),
  G50 extended (a refused condition on a plain create/edit still reads "Validation failed").

## Deferred and residues

- Bulk "Add to segment…" from lists (G34).
- Evaluate now's extra review step (G55).
- A `segment_condition_invalid` on a plain create/edit shows only the generic alert (G48/G50); the client
  validator mirrors the server, so this needs a race (a custom field switched off or a record deleted
  between loading and saving).
- Enum values in conditions are humanized from the catalog (`checked_in` → "checked in"), not the
  console's enum labels: the catalog does not name the enum.
- Archiving does not check notification-rule conditions that name the segment (jsonb, no resource filter).
- Test residues: memberships are never deleted, so the dev tests and the smoke suite reuse fixed segments
  ("Dev test: preview and evaluation", "Dev test: manual membership", "E2E: evaluation", "E2E: manual
  membership"), reactivate them each run and leave them archived with no open membership; their history
  grows by a few rows per run and they show in the Archived view. The suite's own dynamic segment is
  created inactive (never evaluated) and deleted from the console. A "Segment mvfpvndf-1" manual segment
  with one member predates this task (left as found).
- `src/modules/people/profile.ts` is 309 lines (over the ~300 guideline by a few lines).

## Known limits

- The preview's sample labels come from the backend (profiles: full name; identities: code).
- An evaluation started while another runs answers "stale" (a newer evaluation had already run).

## Gates

With `ITAP_DEV_STACK=1`: 852 passed (123 files, unit/jsdom and dev-stack). e2e `segments.spec.ts` 3 passed.
Lint, typecheck and build clean; `pnpm --filter nhost test` 100 passed; Hasura metadata consistent after
migration 283.

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed  # dev stack, migrations and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e -- segments.spec.ts         # segments smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` and `GRAPHQL_ADMIN_SECRET` are in `apps/backend/.env`. Sign-in is limited to ten per five
minutes; leave about five minutes between a dev-stack run and an e2e run.
