# Multi-Agent Daemon

Orchestrates parallel development work using a daemon loop with Planning, Execution, and Judging phases. Adapted for the ITAP monorepo (React + TypeScript + Hasura/Nhost stack -- NO Go).

## Invocation

```bash
make agent            # Start daemon (interactive mode)
make agent-classic    # Start daemon (classic mode)
```

Or invoke directly:

```bash
claude --dangerously-skip-permissions /multi-agent "<goal description>"
```

## Daemon Loop

The daemon runs in a CYCLE that repeats until the goal is achieved or a fatal error occurs.

```
CYCLE N:
  1. PLANNING  -> Planner agent decomposes goal into tasks
  2. EXECUTION -> Worker agents implement tasks in parallel
  3. JUDGING   -> Judge agent evaluates results and decides next action
```

### Resume Mode

If the daemon detects existing `bd` issues in `in_progress` or `open` status, it skips Planning and resumes from Execution. This allows recovery from crashes or interrupted sessions.

```bash
# Check for existing work
bd ready
bd list --status in_progress
```

If tasks exist, jump directly to Execution phase.

---

## Phase 1: Planning

The daemon spawns a **Planner** agent using the prompt at `prompts/planner.md`.

**Model**: `claude-sonnet-4-20250514` (Sonnet -- strong reasoning, cost-effective)

**Inputs**:
- The goal description from the user
- Current codebase state (via CLAUDE.md, AGENTS.md)
- Existing `bd` issues (to avoid duplicates)
- Implementation priorities from `docs/stages/`

**Outputs**:
- `bd` issues created for each task
- Task documentation in `tasks/<task-name>/overview.md`
- File ownership assignments (no overlapping files between tasks)

**Rules**:
- Each task should be completable in 15-30 minutes
- Tasks must have exclusive file ownership (no two tasks modify the same file)
- Tasks must include acceptance criteria with quality gates
- Planner must research existing code patterns before creating tasks

---

## Phase 2: Execution

The daemon spawns **Worker** agents (one per task) using the prompt at `prompts/worker.md`.

**Model**: `claude-haiku-4-20250514` (Haiku -- fast execution, low cost)

Workers run in parallel on their assigned tasks. Each worker:

1. Claims a task with `bd update <id> --status in_progress`
2. Implements the changes within their assigned file scope
3. Runs quality gates:
   ```bash
   pnpm lint        # Lint check
   pnpm typecheck   # TypeScript compilation
   pnpm build       # Full build verification
   ```
4. Commits and pushes to the shared branch
5. Closes the task with `bd close <id>`

**Concurrency Rules**:
- All workers operate on the **same branch** (single branch workflow)
- Workers must `git pull --rebase` before pushing
- File ownership prevents merge conflicts
- If a worker is blocked, it sets `bd update <id> --status blocked`

---

## Phase 3: Judging

The daemon spawns a **Judge** agent using the prompt at `prompts/judge.md`.

**Model**: `claude-sonnet-4-20250514` (Sonnet -- needs strong evaluation reasoning)

The Judge evaluates the cycle results and makes one of four decisions:

| Decision | Meaning |
|---|---|
| `CONTINUE` | Some tasks remain; run another Execution phase |
| `FRESH_START` | Too many failures; re-plan from scratch |
| `STOP` | All tasks complete and quality gates pass |
| `FAILED` | Unrecoverable error; halt the daemon |

**Evaluation Metrics**:
- Completion rate (tasks closed / tasks total)
- Blocked task count
- Quality gate results (lint, typecheck, build)
- Goal satisfaction assessment

---

## Model Selection Summary

| Role | Model | Rationale |
|---|---|---|
| Planner | Sonnet | Strong reasoning for task decomposition |
| Worker | Haiku | Fast execution, parallel cost efficiency |
| Judge | Sonnet | Reliable evaluation and decision-making |

---

## Quality Gates

Every worker must pass these before committing:

```bash
pnpm lint        # ESLint checks
pnpm typecheck   # TypeScript strict mode
pnpm build       # Production build succeeds
```

There are NO Go tests. This is a TypeScript/React project using pnpm.

---

## Single Branch Workflow

All agents work on the same branch. The flow:

1. Daemon starts on current branch (or creates a feature branch)
2. All workers commit to this branch
3. Workers use `git pull --rebase` to stay in sync
4. File ownership prevents conflicts

---

## Session Close Protocol

When the daemon completes (Judge returns `STOP`), execute the close protocol:

```bash
# 1. Sync bd issues with git
bd sync

# 2. Push all changes to remote
git pull --rebase
git push

# 3. Verify clean state
git status  # Must show "up to date with origin"
```

Work is NOT complete until `git push` succeeds. Never leave work stranded locally.

---

## Error Recovery

| Error | Recovery |
|---|---|
| Worker fails quality gates | Worker retries with fixes (up to 3 attempts) |
| Worker blocked on dependency | Mark as blocked, continue other tasks |
| Git conflict | Worker rebases and retries |
| Build failure | Judge evaluates; may trigger FRESH_START |
| All workers blocked | Judge returns FAILED with diagnosis |

---

## Scaling Rules by Complexity

| Complexity | Tasks | Workers | Cycles |
|---|---|---|---|
| Small (single feature) | 2-4 | 2 | 1-2 |
| Medium (multi-file feature) | 4-8 | 3-4 | 2-3 |
| Large (cross-cutting change) | 8-15 | 4-6 | 3-5 |

For the ITAP project, most work falls in the Small to Medium range. Avoid creating more than 6 parallel workers to prevent resource exhaustion.

---

## Task Documentation

Each task gets documentation in:

```
tasks/<task-name>/
  overview.md     # Goal, file ownership, acceptance criteria
  specs/          # Detailed specs if needed
```

This documentation persists after the daemon completes, providing context for future sessions.
