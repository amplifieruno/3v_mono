# ITAP Console Phase 10 — Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physical access: versioned access policies with four-eyes approval and simulation, access
grants, emergency overrides, access decisions log and analytics, and terminal policy sync.

**Architecture:** A new `access` ConsoleModule. Policies follow the versioned pattern (header + versions
with subjects/targets junctions) and every lifecycle step is a SQL function behind a flow:
`create_access_policy_draft`, `submit_access_policy_version`, `approve_access_policy_version`,
`reject_access_policy_version`, `archive_access_policy`, `simulate_access_policy`; grants are immutable
except revocation (`revoke_access_grant`); overrides via `start_emergency_override` /
`end_emergency_override`; terminals via `terminal_sync_status` and action `publish_policy_to_terminals`.

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.13 and "Access engine (as
built)" in §8.1.

## Global Constraints
- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Four-eyes: the approver must differ from the submitter — the Approve action is not offered to the
  submitter (rule with reason) and the server refusal is still shown; a pending version and its children
  are frozen (no edit offered).
- Exactly-one subjects (profile / segment / profile type / access level) and targets (facility / area /
  access point) use record types or conditional fields; many-to-many via buro links when the release with
  link writes is installed, else junction relatedLists.
- Schedules reuse `timeWindows({ emptyText: 'Always' })`; overrides need justification ≥ 10 chars and
  end ≤ start + 24 h (client validation mirrors the CHECKs).
- Decisions and terminal syncs are append-only logs (noAggregate, cursor).

## Review Focus
1. The submitter of a version cannot approve it (no button; server refusal on a forced call). — Task 1.
2. Simulating a draft shows decisions it would change against history, writing nothing. — Task 1.
3. Ending an override early requires a reason and is reflected on every affected terminal after sync. — Task 3.
4. A single-use grant shows used/unused and cannot be edited, only revoked. — Task 2.
5. A decision's reason and signals are readable (trace view), not raw JSON only. — Task 2.

---
### Task 1: Access policies, versions, approval, simulation
Policy header + versions (effect, priority, schedule, validity, max risk, subjects, targets), draft
editing, submit/approve/reject (reason)/archive flows, rollback = new draft from a superseded version,
simulation flow with results block, policy analytics (`policy_analytics`). Commit `feat(ui): access policies`.

### Task 2: Grants and decisions
Grants (profile, area or access point, validity, single use, reason; revoke flow with reason), access
decisions log (result/reason enums, risk score, signals trace block, links to person/door/policy/grant/
override), `check_access` test flow on an access point. Commit `feat(ui): access grants and decisions`.

### Task 3: Emergency overrides and terminals
Overrides (facility, mode, areas, justification, end time; start/end flows; active banner in the shell
for the selected facility), terminal sync status per device (`terminal_sync_status`, `terminal_policy_syncs`
log), "Publish policy to terminals" app action. Commit `feat(ui): emergency overrides and terminal sync`.

### Task 4: Phase close
e2e `access.spec.ts` (draft → submit → approve as a second admin (`nova.admin@itap.demo`) → publish;
grant + revoke; start and end an override), gates, demo `phase-10-access.webm`, `summary-10-access.md`,
gaps/roadmap, push.
