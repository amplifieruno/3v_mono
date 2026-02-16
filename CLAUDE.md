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
- **Database**: PostgreSQL via TypeORM
- **Cache**: Redis
- **Real-time**: Socket.io
- **Face Recognition**: face-api.js, TensorFlow.js

### Data Layer (`apps/nhost/`)
- **GraphQL Engine**: Hasura (via Nhost)
- **Database**: PostgreSQL
- **Auth**: Nhost authentication
- **Migrations**: Hasura CLI migrations
- **Type Generation**: graphql-codegen

### Infrastructure
- **Docker Compose**: PostgreSQL, Redis, MinIO, Hasura, Traefik
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

### Hasura / Database

```bash
make hasura_apply                   # Apply Hasura migrations + metadata
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
3. **face-api.js**: Fallback for backend face processing

Focus on real functionality with lightweight solutions, not fake demos.
