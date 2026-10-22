# ITAP Console Phase 7 — Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual and dynamic segments over identities or profiles: a conditions editor driven by the
server's field catalog, preview and evaluation, membership with history, daily stats and templates.

**Architecture:** A new `segments` ConsoleModule. The conditions editor is a reusable custom field
type `segmentConditions({ targetField })` whose field list, types and operators come from the tracked
query `segment_fields` (the single source the server validates against). Preview/evaluate are Hasura
actions (`preview_segment`, `evaluate_segment`); manual membership writes go through
`add_segment_members` / `remove_segment_members` (members are select-only for org_admin).

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.5 (conditions grammar,
operators per type, limits, null semantics, relative dates), §8.3 (`evaluate_segments*` crons).

## Global Constraints

- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Conditions grammar exactly as §6.5: groups `{op:'and'|'or'|'not', children}` (not has one child;
  ≤ 100 children, depth ≤ 7), leaves `{field, operator, value}`; operators per type from the catalog;
  `in/nin` ≤ 500 values; dates accept absolute or `{relative_days: n}` (|n| ≤ 36500); errors
  `segment_condition_invalid:<json path>` mapped back to the offending node in the editor.
- `kind` and `target` are immutable after create (`write: 'create'`); manual segments have `{}`
  conditions; only manual segments may be referenced by a `member_of_segment` leaf.
- Membership history is never deleted; "remove" closes a row (server function).
- Schedule reuses `timeWindows({ emptyText: 'Always' })` (check the segment schedule shape; if it is
  the shared window shape, reuse; else document the difference).

## Review Focus

1. A condition referencing a field the catalog no longer offers is shown as invalid, not dropped. — Task 2.
2. A server `segment_condition_invalid:$.children[2].value` lands on that node. — Task 2.
3. Preview of an unsaved dynamic segment shows count and sample without creating anything. — Task 3.
4. Adding a person already in the segment by rule "pins" them (manual row) as the server does; the UI
   shows source manual. — Task 3.
5. Archiving a segment referenced by a rule/scope is refused with the server's reason. — Task 1.

---

### Task 1: Segments resource, templates, stats
Segment resource (number, name, description, color, icon, kind, target, conditions (Task 2 field),
status, active window, schedule, member_count/last_evaluated/errors system), list with saved views by
kind/target/status, templates (system read-only; "Create from template" flow), daily stats chart block
(member count, added, removed — reuse the SVG chart pattern of the health chart). Commit
`feat(ui): segments, templates and stats`.

### Task 2: Conditions editor field
`segmentConditions()` field type: tree editor (add group/leaf, change op, reorder, delete), leaf
editors per field type from `segment_fields` (text, enum with values, integer/number, boolean, date with
relative toggle, timestamp, references with a relation picker to the referenced resource, jsonb paths
for attributes/custom fields), client validation mirroring the grammar, server error path mapping,
compact display (readable sentence). Commit `feat(ui): segment conditions editor`.

### Task 3: Preview, evaluation, membership
"Preview" (on create/edit of dynamic segments: count + sample labels via `preview_segment`), "Evaluate
now" flow (`evaluate_segment`, shows added/removed/stale), members list (current and history, source
manual/rule), manual add/remove flows over the SQL functions (bulk add from identity/profile lists:
bulk flow "Add to segment…"), segment memberships tab on identity and profile pages. Commit
`feat(ui): segment preview, evaluation and membership`.

### Task 4: Phase close
e2e `segments.spec.ts`, gates, demo `phase-07-segments.webm`, `summary-07-segments.md`, gaps/roadmap, push.
