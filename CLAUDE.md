# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed):
   ```bash
   pnpm lint            # Linting
   pnpm typecheck       # TypeScript type checking
   pnpm build           # Build verification
   ```
3. **Record demo** (if UI changed) - See `.claude/skills/demo-record/SKILL.md`:
   - Use Playwright `browser_run_code` to record a video walkthrough
   - Video saved to `playwright-output/`
   - Skip for non-UI changes (Hasura-only, backend-only, config, docs)
4. **Update issue status** - Close finished work, update in-progress items
5. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
6. **Clean up** - Clear stashes, prune remote branches
7. **Verify** - All changes committed AND pushed
8. **Hand off** - Provide context for next session (include demo video path if recorded)

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

---

## DEMO Project Mindset

**THIS IS A DEMO PROJECT.** We do NOT build production-grade infrastructure. We build something that:

- **Demonstrates** the functionality described in the specs (`docs/base/`)
- **Looks real** through proper UI and data structures
- Uses **simple, lightweight solutions** instead of complex distributed systems
- Prioritizes **visual demo** over backend scalability
- Uses **Hasura for data layer** (CRUD, permissions, GraphQL) — no custom ORM logic
- Uses **open-source face recognition** (Human library) for real demos, not fakes

**Decision framework:** If there are two ways to implement something, choose the one that:
1. Gets to a working demo faster
2. Requires less infrastructure
3. Can be shown to stakeholders

---

## Project Overview

Identity Tracking and Access Platform (ITAP) monorepo — a platform leveraging computer vision to detect and identify individuals in video streams and images.

### Core Functional Modules

- **Identity Database Management**: CRUD for Identity records
- **Profile Management**: Known individuals with personal data
- **Segment Management**: Logical groups of Identities
- **Face-Based Authorization**: Face recognition-based authentication
- **Facility and Area Management**: Physical locations hierarchy
- **Device Management**: Video sources and hardware
- **Real-Time Tracking**: Identity movement monitoring
- **Analytics and Reporting**: Flows, behaviors, trends
- **Notification System**: Configurable alerts

### Key Domain Entities

- **Identity**: Any tracked entity (known/unknown individuals)
- **Profile**: Personal data for known individuals
- **Segment**: Logical grouping based on conditions
- **Facility**: Physical site
- **Area**: Subdivision of Facilities into zones
- **Device**: Cameras, sensors, access control terminals

---

## Technology Stack

### Frontend (`apps/admin-ui/`)
- **Framework**: React 19 + TypeScript + Vite
- **UI**: TailwindCSS v4 + shadcn/ui + Radix UI
- **Data**: Refine framework + React Query + GraphQL
- **State**: Zustand for client state
- **Forms**: react-hook-form + Zod validation
- **Real-time**: Socket.io client
- **Face Recognition**: Human library (`@vladmandic/human`)

### Backend (`apps/backend/`)
- **Runtime**: Node.js + Express + TypeScript
- **Data access**: Hasura GraphQL client with the admin secret (`src/hasura/`)
- **Role**: Hasura Actions handlers (`src/actions/`: tenancy, files, `upload_profile_document`, `enroll_face`, `create_identity_from_photos`, `add_identity_photos`, `search_faces`, `recognition_start` / `recognition_stop` / `recognition_status`), Hasura event/cron trigger router (`src/events/`, below), org-token signing (`src/auth/`), storage client (`src/storage/`), seed (`src/seed/`)
- **Events router**: `POST /hasura/events/<trigger name>` (same `x-action-secret` as actions). Handlers are registered in `defaultEventHandlers` (`src/events/router.ts`) via `defineEventHandler` / `defineCronHandler`; a non-2xx answer makes Hasura retry, so handlers must be idempotent (`ctx.idempotencyKey`). Cron triggers are declared in `apps/nhost/metadata-src/crons.ts` (`CronSpec`, incl. `toleranceSeconds`) and generated into `cron_triggers.yaml`
- **Crons**: `heartbeat` (every 5 min, pipeline proof, writes nothing); `device_health_check` (every minute, tolerance 120 s): probes the stream-server per active camera (`/streams/<id>/snapshot.jpg`, id = last path segment of `stream_url`) and calls the SQL function `record_device_health`, which writes `device_health_metrics`, updates `devices.health_status`/`last_seen_at`/`status` (`connection_error` on outage) and emits `device_events`
- **Crons** (slice 4 additions): `close_stale_sessions` (every 2 min, closes idle tracking sessions), `evaluate_dwell_rules` (every minute, loitering / unusual dwell), `lifecycle_jobs` (daily 03:00 UTC: no-show visits, expired visitor/contractor profiles and invitations, archive unknown identities). Event trigger `detection_created` runs Stage B (`itap.evaluate_detection`)
- **Notifications** (slice 5): Stage C fan-out runs in SQL (`itap.fan_out_event`) inside `finish_events`; event triggers `send_delivery`, `send_webhook` (HMAC-signed, SSRF-guarded; dev sink `/hasura/events/webhook-sink` when `WEBHOOK_SINK_ENABLED`), crons `retry_deliveries` / `retry_webhooks` (1 min), `escalate` (1 min, incident escalation policies, on-call), `send_digests` (hourly). Env: `WEBHOOK_SINK_ENABLED`, `WEBHOOK_ALLOW_PRIVATE_TARGETS` (both false in prod)
- **Segments** (slice 6): manual and dynamic segments over identities or profiles; the field catalog (`segment_fields`) is the single source; one evaluator = backend translator (`src/segments/`) -> Hasura `where` -> `itap.sync_segment_members`. Actions `preview_segment` (dry run) and `evaluate_segment`; crons `evaluate_segments_pending` (1 min, debounced input changes via `segment_evaluation_requests`) and `evaluate_segments` (hourly: activity stats, all dynamic segments, daily stats). Event rule scopes and notification rule conditions accept segments (membership as of the event time); query `test_notification_rule` dry-runs a notification rule
- **Analytics, reports, search, bulk** (slice 7): hourly cron `aggregate_stats` (:05, trailing window) fills `area_hourly_stats` / `facility_daily_stats` / `area_transitions_daily` (`aggregate_stats_range` for back-fill/seed); query functions `facility_occupancy_now`, `occupancy_series`, `flow_matrix`, `dashboard_kpis`, `identity_timeline`; Stage B `abnormal_movement`. Reports: event trigger `render_report` (lease-based; `src/reports/`: CSV/JSON/PDF/XLSX renderers, no deps), cron `run_report_schedules` (15 min), SQL `generate_incident_report` / `retry_report`. Search: action `search_faces` (shared `src/search/searchService.ts`, owner-only history), cron `run_saved_searches` (hourly). Bulk jobs: event trigger `run_bulk_job` (detached, `src/bulk/`), cron `resume_bulk_jobs` (1 min), `retry_bulk_job` / `cancel_bulk_job`. Seed adds stats history, 10+ reports with files, searches, bulk jobs, dashboards, a replayed night shift (takes about 160 s with `--reset`)
- **Physical access** (slice 8): crons `end_emergency_overrides` (every minute, two-phase expiry of overrides) and `sync_terminal_policies` (every minute; urgent/lazy terminal policy sync through the stub transport in `src/access/terminalSync.ts`, tolerance 120 s); event trigger `policy_urgent_epoch_bumped` (organization_settings.policy_urgent_epoch changed -> immediate push to that organization's reachable terminals, the cron is the safety net); action `publish_policy_to_terminals` (forces a push). Decisions come from SQL `itap.evaluate_access` (policies, grants, overrides, risk; Stage B calls it for face-credential doors, `check_access` for terminals). Seed adds access policies via four-eyes approval, face-credential doors, visitor grants, a fire drill, an offline terminal and ~6.6k decisions through the replay
- **Face authentication service** (slice 9, `src/auth-service/`): REST `/v1/auth/*` for client applications (sessions, authenticate, recapture, second-factor, session status, health, `openapi.json`), HMAC key auth `Authorization: ITAP-HMAC key=<prefix>, ts, sig`; decisions run in SQL (`itap.auth_population`, `auth_decide`, `auth_attributes`, review, second factor). Actions `rotate_client_key`, `authenticate_face` (console). Cron `expire_auth_sessions` (1 min, also sweeps orphan `auth_capture` evidence). Env `AUTH_KEY_ENCRYPTION_KEY` (64 hex; required by the backend and by the seed, owner action for prod; unset -> keyed routes 503). Seed: 5 client apps, 20 synthetic identities, 30 days of attempts; in dev the seed log prints `Face auth: demo key for <app> ... key=<prefix> secret=<secret>` once when a key is issued (`pnpm seed --reset` re-issues). Integrator doc: `tasks/data-layer/face-auth-api.md`; insightface needs `cpus: 4.0` for the 2 s target
- **Recognition module** (`src/recognition/`): the manager polls cameras with `recognition_enabled` (every 10 s) and runs one session per camera (stream-server snapshot -> InsightFace -> `match_face` -> detections -> Stage A in SQL), pushes `detection` over Socket.io (room `device:<id>`, org-token auth). Live demo: action `recognition_start` on a camera (seeded cameras are off). `RECOGNITION_ENABLED=false` is the kill switch for the whole manager
- **Seed layout** (`pnpm seed`, `src/seed/`): organization Nova Tower (facility with a floor/zone/room area tree and floor plans, access points and devices incl. cameras bound to the stream-server ids `entrance`/`lobby`/`serverroom`/`warehouse`, health history, then a 30-day history replay through the real detection pipeline: tracked people, watch lists, event rules, visits, detections, events, incidents; takes several minutes, `--reset` re-creates it); plans are pure data (`facilityPlan.ts`, `devicePlan.ts`, `deviceHealthPlan.ts`)
- **Legacy removed**: TypeORM, REST routes, recognition manager, face-api.js/TensorFlow, Redis are gone; all data goes through Hasura
- **Runs in Docker** (dev compose service `backend`, port 3001) so Hasura can reach it; no Redis
- **Real-time**: Socket.io
- **Face Recognition**: InsightFace REST client, quality checks, crops and the enrollment service shared by actions and seed (`src/face/`); matching runs in SQL (`match_face`, pgvector)

### Data Layer (`apps/nhost/`)
- **GraphQL Engine**: Hasura (via Nhost)
- **Database**: PostgreSQL
- **Auth**: Nhost authentication
- **Migrations**: Hasura CLI migrations
- **Type Generation**: graphql-codegen

### Infrastructure
- **Docker Compose**: PostgreSQL (pgvector), MinIO, Hasura, Nhost auth/storage, backend, Traefik
- **File Storage**: MinIO (S3-compatible)
- **Face Recognition**: InsightFace REST API (Docker)

---

## Project Structure

```
3v_mono/
├── .claude/                # Agent configurations
│   ├── agents/             # Specialized agent definitions
│   ├── skills/             # Reusable skills (multi-agent, commit, ship, etc.)
│   ├── rules/              # Code quality rules
│   ├── AGENTS.md           # Agent role definitions
│   └── settings.json       # Hooks, environment, permissions
├── apps/
│   ├── admin-ui/           # React dashboard (Refine + shadcn/ui)
│   ├── backend/            # Express API server
│   └── nhost/              # Hasura/Nhost configuration
├── packages/
│   └── shared/             # Shared types and utilities
├── libs/
│   └── InsightFace-REST/   # Face recognition (git submodule)
├── docker/                 # Docker configurations
├── docs/
│   ├── base/               # Project specs (Vision, Functional Spec)
│   └── stages/             # Implementation stages (SA_2, SA_3, SA_4)
├── tasks/                  # Task documentation (see below)
├── .beads/                 # Issue tracking database
├── CLAUDE.md               # This file
├── Makefile                # Development commands
└── package.json            # Root monorepo config
```

---

## Documentation Structure

### Project Specs (`docs/base/`)
- `Vision_and_Scope.md` — High-level project vision and scope
- `Functional_Specification.md` — Detailed functional requirements, user stories, acceptance criteria

### Implementation Stages (`docs/stages/`)
- `SA_2_EN.md` — Stage 2: Infrastructure + Face Recognition
- `SA_3_EN.md` — Stage 3: Advanced features
- `SA_4_EN.md` — Stage 4: Analytics + Integrations

**Priority**: What's in `docs/stages/` takes priority over `docs/base/` for implementation order.

### Task Documentation (`tasks/`)

Each task is documented in its own folder:

```
tasks/
├── README.md                    # Workflow explanation
├── <task-name>/
│   ├── overview.md              # Task description, goals, context
│   ├── specs/                   # Implementation specifications
│   │   ├── 01-data-model.md     # Spec for data model work
│   │   ├── 02-api-endpoints.md  # Spec for API work
│   │   └── 03-ui-pages.md       # Spec for UI work
│   └── summary.md               # Post-completion: what was done, how, decisions made
```

**Workflow:**
1. Create `overview.md` from the goal/bd issue
2. Generate specs in `specs/` (one per subtask; small tasks = one spec)
3. Link specs to bd issues for tracking
4. After completion, write `summary.md` for documentation

---

## Development Commands

### Quick Start

```bash
# Install dependencies
pnpm install

# Start dev environment (Docker + dev servers)
make dev

# Or manually:
make dev-compose                    # Start Docker infrastructure
pnpm run dev                        # Start all dev servers
```

### Quality Gates

```bash
pnpm lint                           # Run linting
pnpm typecheck                      # TypeScript type checking
pnpm build                          # Build all packages
pnpm test                           # Run tests
```

### Data Layer (Hasura / Postgres / backend)

Spec, roadmap and per-slice plans/summaries live in `tasks/data-layer/` (`design.md`, `roadmap.md`, `plan-NN-*.md`, `summary-NN-*.md`). Conventions: `.claude/rules/hasura-conventions.md`.

```bash
make dev-compose                    # Start infra incl. the backend container (Hasura Actions call it)
make hasura_apply                   # Apply Hasura migrations + metadata
make db_reset                       # Recreate itap schemas, re-apply migrations (dev only; keeps auth/storage)
pnpm --filter nhost metadata:generate  # Regenerate itap.* Hasura metadata (never hand-edit it)
pnpm --filter nhost test            # Metadata generator unit tests
pnpm --filter backend exec vitest run src   # Backend unit tests
pnpm --filter backend test:integration      # Integration tests against the running dev stack
pnpm seed                           # Seed demo orgs/users, companies, profiles, enrolled faces, facilities, areas, devices, health history (needs insightface; --reset wipes seed data)
cd apps/admin-ui && pnpm gql        # Generate GraphQL types
cd apps/admin-ui && pnpm gql-w      # Watch mode for GraphQL codegen
```

### Docker

```bash
make dev-compose                    # Start dev infrastructure
make prod                           # Start production stack
make prod-down                      # Stop production
make prod-rebuild                   # Rebuild production
```

**Security:** dev services bind to `127.0.0.1` only (Docker-published ports bypass ufw). Use an SSH tunnel (`ssh -L 8080:127.0.0.1:8080 host`) for remote access. Never publish Hasura on a public interface with the default admin secret.

### Agent Teams

```bash
make agent GOAL="..."               # Start agent team
make agent-safe GOAL="..."          # Agent team with plan approval
make agent-classic GOAL="..."       # Legacy multi-agent daemon
make agent-resume GOAL="..."        # Resume multi-agent daemon
make agent-status                   # Show task status
make claude                         # Start Claude in team mode
```

---

## Architecture Rules

### 1. Hasura-First Data Layer

- **ALL data access via Hasura GraphQL** — never direct PostgreSQL queries from app code
- Manage schema via Hasura console, export metadata to git
- Permissions and RLS live in Hasura metadata, not in application code
- Use graphql-codegen for type-safe operations

### 2. Simple CRUD via Hasura

- Standard CRUD operations → use Hasura directly (no custom backend needed)
- Complex business logic → Express handler calling Hasura via GraphQL
- Never duplicate Hasura's built-in capabilities

### 3. Frontend Patterns

- **Components**: shadcn/ui from the library, never raw HTML when component exists
- **Styling**: TailwindCSS v4 utility classes, no inline `style={}`
- **State**: React Query for server state, Zustand for client state
- **Forms**: react-hook-form + Zod validation
- **Data fetching**: Never `useEffect` for fetching — use React Query hooks
- **Icons**: lucide-react only

### 4. File Organization

- File size limit: ~300 lines (split if larger)
- One component per file
- Named exports (exception: pages use `export default` for lazy loading)
- No `any` — use `unknown` + type narrowing or proper generics

### 5. English Only

All code, comments, documentation, and commit messages MUST be in English.

---

## Quality Gates (Before Commit)

```bash
pnpm lint                    # Must pass
pnpm typecheck               # Must pass
pnpm build                   # Must succeed
```

If ALL gates pass, commit and push. If any fail, fix before committing.

---

## Commit Format

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
Closes mono-xxx
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Types**: feat, fix, refactor, perf, test, docs, chore
**Scopes**: ui, backend, hasura, shared, docker, ci, docs

---

## Code Review Checklist

- [ ] No security vulnerabilities (XSS, injection, secrets in code)
- [ ] TypeScript types are correct (no `any`)
- [ ] Hasura permissions reviewed (if metadata changed)
- [ ] UI follows shadcn/ui patterns
- [ ] No over-engineering (remember: DEMO project)
- [ ] Quality gates pass (lint, typecheck, build)
- [ ] Files under ~300 lines

---

## Anti-Patterns (Avoid These)

- Direct PostgreSQL connections from app code (use Hasura)
- Manual auth/permission checks in TypeScript (use Hasura metadata)
- `useEffect` for data fetching (use React Query)
- `useState` for form state (use react-hook-form)
- Raw HTML elements when shadcn component exists
- Inline styles instead of TailwindCSS
- Over-engineering for "future scalability" — this is a DEMO
- Console.log in committed code
- `any` type in TypeScript

---

## Verification with Playwright

After UI changes, verify visually using Playwright MCP tools:
1. `mcp__playwright__browser_navigate` to the relevant page
2. `mcp__playwright__browser_snapshot` to verify accessibility tree
3. `mcp__playwright__browser_take_screenshot` for visual verification
4. Test interactions with `mcp__playwright__browser_click`, etc.

This ensures UI changes work correctly without manual testing.

### Recording Demo Videos

For a recorded walkthrough (required for UI changes before closing a task):
1. Use `mcp__playwright__browser_run_code` with `recordVideo` to capture a `.webm` video
2. Walk through the implemented feature (login, navigate, demonstrate CRUD/interactions)
3. Close the context to save the video to `playwright-output/`
4. Report the video path in the task close comment

See `.claude/skills/demo-record/SKILL.md` for the full recipe.

---

## Face Recognition Strategy

Using proven open-source solutions for DEMO:

1. **Human Library** (`@vladmandic/human`): Primary client-side face detection/recognition
2. **InsightFace REST**: Docker-based face recognition service for server-side processing
3. ~~face-api.js~~: removed in slice 2 (backend uses InsightFace REST only)

Focus on real functionality with lightweight solutions, not fake demos.
