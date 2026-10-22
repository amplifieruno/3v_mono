# ITAP Console Phase 11 — Face Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The face authentication service as seen by an administrator: client applications with their
bindings and thresholds, API keys (rotate/revoke, secret shown once), sessions and attempts with review
of partial matches, and a console "Authenticate a face" tester.

**Architecture:** A new `face-auth` ConsoleModule. Keys via action `rotate_client_key` (secret shown once
in a block, like the invitation token) and `revoke_client_key`; review via `review_authentication_attempt`;
console test via action `authenticate_face` with 3–5 captured/uploaded frames (webcam block from phase 4).

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.16, "Face authentication engine
(as built)" in §8.1; integrator doc `tasks/data-layer/face-auth-api.md` (linked from the module article).

## Global Constraints
- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Thresholds: `0 ≤ min ≤ threshold ≤ max ≤ 1` validated client-side; sandbox apps bind no facilities or
  access points and see synthetic identities only (`is_sandbox` insert-only).
- Key secrets are never readable after creation; at most 2 active keys; revoked status is terminal.
- Attempts and sessions are append-only logs; review only for `pending` partial matches.
- `secret()` can clear values (phase 3); not used for keys (server-generated).

## Review Focus
1. Rotating a key shows the secret exactly once with copy and a warning; reloading never shows it again. — Task 2.
2. A third active key is refused with the server message. — Task 2.
3. Approving a partial match closes its session and emits the event; the attempt shows reviewer and note. — Task 3.
4. The console tester refuses fewer than 3 frames and shows the decision fields the API returns. — Task 3.
5. A sandbox app cannot be bound to facilities (UI hides it; server refusal shown if forced). — Task 1.

---
### Task 1: Client applications
Resource (number, name, platform, status, thresholds, liveness, work schedules flag, sandbox), bindings
(segments, facilities, access points, modes, attributes) as links/junctions, status flows (suspend,
revoke), article linking the integrator API doc. Commit `feat(ui): face auth client applications`.

### Task 2: Keys
Keys list per application (prefix, created, expires, last used, revoked), rotate flow (expiry option;
secret block shown once), revoke flow with confirm. Commit `feat(ui): face auth keys`.

### Task 3: Sessions, attempts, review, tester
Sessions and attempts logs (outcome, failure reason, confidence vs threshold, population size, latency,
evidence via open_file for kind auth_capture), review queue (approve/reject with note), "Authenticate a
face" tester page (app, mode, frames via webcam/upload → `authenticate_face` → decision view). Commit
`feat(ui): face auth sessions, review and tester`.

### Task 4: Phase close
e2e `face-auth.spec.ts`, gates, demo `phase-11-face-auth.webm`, `summary-11-face-auth.md`, gaps/roadmap, push.
